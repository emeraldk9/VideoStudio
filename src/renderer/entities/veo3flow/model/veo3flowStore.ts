import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  spineTrackOf,
  type SequenceClip,
  type SequenceTrack,
  type Veo3FlowProjectData,
  type Veo3FlowShotMedia,
} from '@shared';

import { formatIpcError } from '../../../shared/lib/formatIpcError';
import { useToastStore } from '../../../shared/model/toastStore';
import { useImportedMediaStore } from '../../sequence/model/importedMediaStore';
import { useSequenceStore } from '../../sequence/model/sequenceStore';

export type Veo3FlowPlaceMode = 'stills_only' | 'videos_only' | 'hybrid' | 'dual_track';

export interface PlaceAllOptions {
  replace?: boolean;
  mode?: Veo3FlowPlaceMode;
  targetTrackId?: string;
}

export interface Veo3FlowState {
  projectData: Veo3FlowProjectData | null;
  lastFolderPath: string | null;
  projectFolderMap: Record<string, string>;
  isLiveSyncing: boolean;
  lastSyncTime: number | null;
  busy: boolean;
  error: string | null;

  openFolder: (projectId?: string) => Promise<Veo3FlowProjectData | null>;
  loadFolder: (folderPath: string, projectId?: string) => Promise<Veo3FlowProjectData | null>;
  bindProjectFolder: (projectId: string, folderPath: string) => Promise<void>;
  unbindProjectFolder: (projectId: string) => Promise<void>;
  syncWithActiveProject: (projectId: string, sequenceStoryRoot?: string | null) => Promise<void>;
  handleFolderUpdated: (updatedData: Veo3FlowProjectData) => void;
  ingestToActiveProject: (projectId: string) => Promise<void>;
  placeAllOnTimeline: (options?: PlaceAllOptions) => Promise<number>;
  placeSingleShot: (shot: Veo3FlowShotMedia, mediaKind?: 'still' | 'video') => Promise<void>;
  clear: () => void;
}

export const useVeo3FlowStore = create<Veo3FlowState>()(
  persist(
    (set, get) => ({
      projectData: null,
      lastFolderPath: null,
      projectFolderMap: {},
      isLiveSyncing: false,
      lastSyncTime: null,
      busy: false,
      error: null,

      clear: () => set({ projectData: null, error: null, isLiveSyncing: false }),

      bindProjectFolder: async (projectId: string, folderPath: string) => {
        set((state) => ({
          projectFolderMap: { ...state.projectFolderMap, [projectId]: folderPath },
          lastFolderPath: folderPath,
        }));
        const seqDoc = useSequenceStore.getState().document;
        if (seqDoc && seqDoc.sequence.projectId === projectId) {
          void useSequenceStore.getState().updateSettings({ storyProjectRoot: folderPath });
        }
        await window.api.veo3flow.watchFolder(folderPath);
        set({ isLiveSyncing: true, lastSyncTime: Date.now() });
      },

      unbindProjectFolder: async (projectId: string) => {
        set((state) => {
          const nextMap = { ...state.projectFolderMap };
          delete nextMap[projectId];
          return {
            projectFolderMap: nextMap,
            projectData:
              state.projectData?.folderPath === state.projectFolderMap[projectId]
                ? null
                : state.projectData,
            isLiveSyncing: false,
          };
        });
        const seqDoc = useSequenceStore.getState().document;
        if (seqDoc && seqDoc.sequence.projectId === projectId) {
          void useSequenceStore.getState().updateSettings({ storyProjectRoot: null });
        }
        await window.api.veo3flow.unwatchFolder();
      },

      syncWithActiveProject: async (projectId: string, sequenceStoryRoot?: string | null) => {
        if (!projectId) return;
        const state = get();
        const targetPath = sequenceStoryRoot || state.projectFolderMap[projectId] || null;

        if (!targetPath) {
          return;
        }

        if (state.projectFolderMap[projectId] !== targetPath) {
          set((s) => ({
            projectFolderMap: { ...s.projectFolderMap, [projectId]: targetPath },
          }));
        }

        if (state.projectData && state.projectData.folderPath === targetPath) {
          if (!state.isLiveSyncing) {
            await window.api.veo3flow.watchFolder(targetPath);
            set({ isLiveSyncing: true, lastSyncTime: Date.now() });
          }
          return;
        }

        await get().loadFolder(targetPath, projectId);
      },

      handleFolderUpdated: (updatedData: Veo3FlowProjectData) => {
        const current = get().projectData;
        if (!current || current.folderPath === updatedData.folderPath) {
          set({
            projectData: updatedData,
            lastFolderPath: updatedData.folderPath,
            lastSyncTime: Date.now(),
            isLiveSyncing: true,
          });
        }
      },

      openFolder: async (projectId?: string) => {
        set({ busy: true, error: null });
        try {
          const data = await window.api.veo3flow.openFolder();
          if (data) {
            const nextMap = projectId
              ? { ...get().projectFolderMap, [projectId]: data.folderPath }
              : get().projectFolderMap;
            set({
              projectData: data,
              lastFolderPath: data.folderPath,
              projectFolderMap: nextMap,
              busy: false,
              isLiveSyncing: true,
              lastSyncTime: Date.now(),
            });
            if (projectId) {
              const seqDoc = useSequenceStore.getState().document;
              if (seqDoc && seqDoc.sequence.projectId === projectId) {
                void useSequenceStore.getState().updateSettings({ storyProjectRoot: data.folderPath });
              }
            }
            await window.api.veo3flow.watchFolder(data.folderPath);
            useToastStore.getState().pushToast({
              variant: 'success',
              message: `Opened ${data.title}: ${data.shots.length} shots (${data.totalApprovedStills} approved stills, ${data.totalApprovedVideos} approved videos).`,
            });
            return data;
          }
          set({ busy: false });
          return null;
        } catch (err) {
          const msg = formatIpcError(err, 'Failed to open story folder');
          set({ error: msg, busy: false });
          useToastStore.getState().pushToast({ variant: 'error', message: msg });
          return null;
        }
      },

      loadFolder: async (folderPath: string, projectId?: string) => {
        set({ busy: true, error: null });
        try {
          const data = await window.api.veo3flow.parseFolder(folderPath);
          if (data) {
            const nextMap = projectId
              ? { ...get().projectFolderMap, [projectId]: folderPath }
              : get().projectFolderMap;
            set({
              projectData: data,
              lastFolderPath: folderPath,
              projectFolderMap: nextMap,
              busy: false,
              isLiveSyncing: true,
              lastSyncTime: Date.now(),
            });
            if (projectId) {
              const seqDoc = useSequenceStore.getState().document;
              if (seqDoc && seqDoc.sequence.projectId === projectId) {
                void useSequenceStore.getState().updateSettings({ storyProjectRoot: folderPath });
              }
            }
            await window.api.veo3flow.watchFolder(folderPath);
            return data;
          }
          set({ busy: false });
          return null;
        } catch (err) {
          const msg = formatIpcError(err, 'Failed to load story folder');
          set({ error: msg, busy: false, isLiveSyncing: false });
          return null;
        }
      },

      ingestToActiveProject: async (projectId: string) => {
        const { projectData } = get();
        if (!projectData) return;

        set({ busy: true });
        try {
          const result = await window.api.veo3flow.ingestToProject(
            projectData.folderPath,
            projectId,
          );
          await useImportedMediaStore.getState().load(projectId);
          set({ busy: false });
          useToastStore.getState().pushToast({
            variant: 'success',
            message: `Indexed ${result.recorded.length} Story assets into project media bin`,
          });
        } catch (err) {
          const msg = formatIpcError(err, 'Failed to ingest media');
          set({ error: msg, busy: false });
          useToastStore.getState().pushToast({ variant: 'error', message: msg });
        }
      },

      placeAllOnTimeline: async (options = { replace: true, mode: 'stills_only' }) => {
        const mode = options.mode || 'stills_only';
        const { projectData } = get();
        if (!projectData || projectData.shots.length === 0) {
          useToastStore.getState().pushToast({
            variant: 'warning',
            message: 'No Veo3Flow shots available to place.',
          });
          return 0;
        }

        const seqStore = useSequenceStore.getState();
        const document = seqStore.document;
        if (!document) {
          useToastStore.getState().pushToast({
            variant: 'error',
            message: 'No active sequence. Please create or open a sequence first.',
          });
          return 0;
        }

        // Determine spine track or primary video track
        let spineTrack: SequenceTrack | null = spineTrackOf(document);
        if (!spineTrack) {
          spineTrack =
            document.tracks
              .filter((t) => t.kind === 'video' && t.role !== 'text' && t.role !== 'overlay')
              .sort((a, b) => a.orderIndex - b.orderIndex)[0] ?? null;
        }

        if (!spineTrack) {
          useToastStore.getState().pushToast({
            variant: 'error',
            message: 'No video track found on the timeline to place shots.',
          });
          return 0;
        }

        const fps = document.sequence.fps || 24;

        if (mode === 'dual_track') {
          // Dual Track mode: Stills on Spine (V1), Videos on Overlay (V2)
          const overlayTrack = document.tracks.find(
            (t) => t.kind === 'video' && t.id !== spineTrack!.id,
          );

          const baseClips = options.replace
            ? document.clips.filter(
                (c) => c.trackId !== spineTrack!.id && (!overlayTrack || c.trackId !== overlayTrack.id),
              )
            : [...document.clips];

          const stillClips: SequenceClip[] = [];
          const videoClips: SequenceClip[] = [];
          let cumulativeFrames = 0;

          for (let i = 0; i < projectData.shots.length; i++) {
            const shot = projectData.shots[i];
            const durationFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
            const startFrames = cumulativeFrames;

            if (shot.stillPath) {
              stillClips.push({
                id: `clip-still-${shot.shotId}-${Date.now()}-${i}`,
                sequenceId: document.sequence.id,
                trackId: spineTrack.id,
                orderIndex: i,
                sourceKind: 'still',
                filePath: shot.stillPath,
                storyShotId: shot.shotId,
                sourceTakeId: shot.stillTakeId,
                startFrames: spineTrack.magnetic ? null : startFrames,
                durationFrames,
                transitionIn: 'cut',
                transitionFrames: 0,
                motionPreset: 'none',
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
                label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Still)`,
                overrides: ['durationFrames'],
              });
            }

            if (shot.videoPath && overlayTrack) {
              videoClips.push({
                id: `clip-video-${shot.shotId}-${Date.now()}-${i}`,
                sequenceId: document.sequence.id,
                trackId: overlayTrack.id,
                orderIndex: i,
                sourceKind: 'video',
                filePath: shot.videoPath,
                storyShotId: shot.shotId,
                sourceTakeId: shot.videoTakeId,
                startFrames: overlayTrack.magnetic ? null : startFrames,
                durationFrames,
                transitionIn: 'cut',
                transitionFrames: 0,
                motionPreset: 'none',
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
                label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading} (Vid)`,
                overrides: ['durationFrames'],
              });
            }

            cumulativeFrames += durationFrames;
          }

          seqStore.commitClips([...baseClips, ...stillClips, ...videoClips]);
          useToastStore.getState().pushToast({
            variant: 'success',
            message: `⚡ Placed Dual-Track cut: ${stillClips.length} stills on V1, ${videoClips.length} videos on V2!`,
          });
          return stillClips.length + videoClips.length;
        }

        // Single track placement (stills_only, videos_only, or hybrid)
        let shotsToPlace: {
          shot: Veo3FlowShotMedia;
          filePath: string;
          isVideo: boolean;
          takeId: string | null;
        }[] = [];

        if (mode === 'videos_only') {
          shotsToPlace = projectData.shots
            .filter((s) => Boolean(s.videoPath))
            .map((s) => ({ shot: s, filePath: s.videoPath!, isVideo: true, takeId: s.videoTakeId }));

          if (shotsToPlace.length === 0) {
            useToastStore.getState().pushToast({
              variant: 'warning',
              message:
                'No approved shot videos found in this project. You can place approved stills or generate videos first.',
            });
            return 0;
          }
        } else if (mode === 'hybrid') {
          // Prefer video, fallback to still
          for (const s of projectData.shots) {
            if (s.videoPath) {
              shotsToPlace.push({ shot: s, filePath: s.videoPath, isVideo: true, takeId: s.videoTakeId });
            } else if (s.stillPath) {
              shotsToPlace.push({ shot: s, filePath: s.stillPath, isVideo: false, takeId: s.stillTakeId });
            }
          }
        } else {
          // stills_only (default)
          shotsToPlace = projectData.shots
            .filter((s) => Boolean(s.stillPath))
            .map((s) => ({ shot: s, filePath: s.stillPath!, isVideo: false, takeId: s.stillTakeId }));
        }

        if (shotsToPlace.length === 0) {
          useToastStore.getState().pushToast({
            variant: 'warning',
            message: 'No media matching this selection was found.',
          });
          return 0;
        }

        const targetTrack = options.targetTrackId
          ? document.tracks.find((t) => t.id === options.targetTrackId) || spineTrack
          : spineTrack;

        const baseClips = options.replace
          ? document.clips.filter((c) => c.trackId !== targetTrack.id)
          : [...document.clips];

        const startOrder = options.replace
          ? 0
          : document.clips.filter((c) => c.trackId === targetTrack.id).length;

        let cumulativeFrames = 0;
        if (!options.replace) {
          for (const c of document.clips.filter((clip) => clip.trackId === targetTrack.id)) {
            cumulativeFrames += c.durationFrames;
          }
        }

        const placedClips: SequenceClip[] = [];

        for (let i = 0; i < shotsToPlace.length; i++) {
          const item = shotsToPlace[i];
          const durationFrames = Math.max(1, Math.round(item.shot.durationSeconds * fps));

          const clip: SequenceClip = {
            id: `clip-story-${item.shot.shotId}-${Date.now()}-${i}`,
            sequenceId: document.sequence.id,
            trackId: targetTrack.id,
            orderIndex: startOrder + i,
            sourceKind: item.isVideo ? 'video' : 'still',
            filePath: item.filePath,
            storyShotId: item.shot.shotId,
            sourceTakeId: item.takeId,
            startFrames: targetTrack.magnetic ? null : cumulativeFrames,
            durationFrames,
            transitionIn: 'cut',
            transitionFrames: 0,
            motionPreset: 'none',
            gainDb: 0,
            fadeInFrames: 0,
            fadeOutFrames: 0,
            label: `${String(item.shot.order + 1).padStart(3, '0')} · ${item.shot.heading}${item.isVideo ? ' (Vid)' : ''}`,
            overrides: ['durationFrames'],
          };

          placedClips.push(clip);
          cumulativeFrames += durationFrames;
        }

        seqStore.commitClips([...baseClips, ...placedClips]);

        const labelMap: Record<Veo3FlowPlaceMode, string> = {
          stills_only: 'approved stills',
          videos_only: 'approved videos',
          hybrid: 'hybrid shots (videos + stills fallback)',
          dual_track: 'dual-track cut',
        };

        useToastStore.getState().pushToast({
          variant: 'success',
          message: `⚡ Placed ${placedClips.length} ${labelMap[mode]} on timeline!`,
        });

        return placedClips.length;
      },

      placeSingleShot: async (shot: Veo3FlowShotMedia, mediaKind: 'still' | 'video' = 'still') => {
        let filePath = mediaKind === 'video' && shot.videoPath ? shot.videoPath : shot.stillPath;
        let isVideo = mediaKind === 'video' && Boolean(shot.videoPath);

        if (!filePath) {
          filePath = shot.stillPath || shot.videoPath;
          isVideo = Boolean(shot.videoPath && !shot.stillPath);
        }

        if (!filePath) {
          useToastStore.getState().pushToast({
            variant: 'warning',
            message: `Shot ${shot.order + 1} has no ${mediaKind} file.`,
          });
          return;
        }

        const seqStore = useSequenceStore.getState();
        const document = seqStore.document;
        if (!document) return;

        let spineTrack: SequenceTrack | null = spineTrackOf(document);
        if (!spineTrack) {
          spineTrack =
            document.tracks
              .filter((t) => t.kind === 'video' && t.role !== 'text' && t.role !== 'overlay')
              .sort((a, b) => a.orderIndex - b.orderIndex)[0] ?? null;
        }
        if (!spineTrack) return;

        const fps = document.sequence.fps || 24;
        const durationFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
        const trackClips = document.clips.filter((c) => c.trackId === spineTrack!.id);

        const newClip: SequenceClip = {
          id: `clip-story-${shot.shotId}-${Date.now()}`,
          sequenceId: document.sequence.id,
          trackId: spineTrack.id,
          orderIndex: trackClips.length,
          sourceKind: isVideo ? 'video' : 'still',
          filePath,
          storyShotId: shot.shotId,
          sourceTakeId: isVideo ? shot.videoTakeId : shot.stillTakeId,
          durationFrames,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: `${String(shot.order + 1).padStart(3, '0')} · ${shot.heading}${isVideo ? ' (Vid)' : ''}`,
          overrides: ['durationFrames'],
        };

        seqStore.commitClips([...document.clips, newClip]);
        useToastStore.getState().pushToast({
          variant: 'success',
          message: `Placed Shot ${shot.order + 1} ${isVideo ? 'Video' : 'Still'} (${shot.durationSeconds}s) on timeline`,
        });
      },
    }),
    {
      name: 'videostudio-veo3flow-storage',
      partialize: (state) => ({
        lastFolderPath: state.lastFolderPath,
        projectFolderMap: state.projectFolderMap,
      }),
    },
  ),
);
