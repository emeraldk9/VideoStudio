import { useState } from 'react';

import type { AspectRatioOption, Veo3FlowProjectData } from '@shared';

import { useProjectStore } from '../../../entities/project';
import { useSequenceStore } from '../../../entities/sequence';
import { useVeo3FlowStore, type Veo3FlowPlaceMode } from '../../../entities/veo3flow/model/veo3flowStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';

export interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ASPECT_OPTIONS: { value: AspectRatioOption; label: string }[] = [
  { value: '16:9', label: '16:9 (Landscape - YouTube, TV)' },
  { value: '9:16', label: '9:16 (Vertical - TikTok, Shorts, Reels)' },
  { value: '1:1', label: '1:1 (Square - Instagram)' },
  { value: '4:5', label: '4:5 (Portrait - Social Media)' },
  { value: '21:9', label: '21:9 (Ultrawide / Cinema)' },
];

export function ProjectModal({ isOpen, onClose }: ProjectModalProps) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const createProject = useProjectStore((state) => state.createProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);

  const openVeo3FlowFolder = useVeo3FlowStore((state) => state.openFolder);
  const ingestToActiveProject = useVeo3FlowStore((state) => state.ingestToActiveProject);
  const placeAllOnTimeline = useVeo3FlowStore((state) => state.placeAllOnTimeline);
  const bindProjectFolder = useVeo3FlowStore((state) => state.bindProjectFolder);

  const [tab, setTab] = useState<'switch' | 'new' | 'story'>('new');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');
  const [fps, setFps] = useState<number>(30);
  const [busy, setBusy] = useState(false);

  // Veo3Flow story state
  const [storyData, setStoryData] = useState<Veo3FlowProjectData | null>(null);
  const [autoPlaceOnTimeline, setAutoPlaceOnTimeline] = useState(true);
  const [placeMode, setPlaceMode] = useState<Veo3FlowPlaceMode>('stills_only');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createProject({
        name: name.trim(),
        aspectRatio,
        fps,
      });
      setName('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleBrowseStoryFolder = async () => {
    setBusy(true);
    try {
      const data = await openVeo3FlowFolder();
      if (data) {
        setStoryData(data);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenStoryProject = async () => {
    if (!storyData) return;
    setBusy(true);
    try {
      // 1. Create or match project in VideoStudio
      const newProj = await createProject({
        name: storyData.episodeTitle || storyData.title || 'Story Project',
        aspectRatio: storyData.aspectRatio || '16:9',
        fps: 24,
      });

      setActiveProject(newProj.id);
      await bindProjectFolder(newProj.id, storyData.folderPath);

      // Ensure sequence document is loaded and opened for this new project
      await useSequenceStore.getState().loadSequences(newProj.id);
      const seqs = useSequenceStore.getState().sequences;
      if (seqs.length > 0) {
        await useSequenceStore.getState().openSequence(seqs[0].id);
      } else {
        await useSequenceStore.getState().createSequence({
          projectId: newProj.id,
          name: storyData.episodeTitle || storyData.title || 'Sequence 1',
        });
      }

      // 2. Ingest approved media into project bin
      await ingestToActiveProject(newProj.id);

      // 3. 1-click place on timeline if enabled
      if (autoPlaceOnTimeline) {
        await placeAllOnTimeline({ replace: true, mode: placeMode });
      }

      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        tab === 'new'
          ? 'New Project'
          : tab === 'story'
            ? 'Open Story Project'
            : 'Select Project'
      }
    >
      <div className="flex flex-col gap-4 select-none">
        {/* Navigation tabs */}
        <div className="flex border-b border-hairline gap-2">
          <button
            type="button"
            onClick={() => setTab('new')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-all ${
              tab === 'new'
                ? 'border-accent-ai text-accent-ai'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Create New
          </button>
          <button
            type="button"
            onClick={() => setTab('story')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1 ${
              tab === 'story'
                ? 'border-accent-ai text-accent-ai'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">auto_stories</span>
            <span>Story Project</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('switch')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-all ${
              tab === 'switch'
                ? 'border-accent-ai text-accent-ai'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Existing ({projects.length})
          </button>
        </div>

        {tab === 'new' && (
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-xs font-medium text-text-secondary">Project Name</label>
              <input
                type="text"
                placeholder="My Video Project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-input border border-hairline bg-bg-app px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-ai"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary">Aspect Ratio</label>
              <Select
                className="mt-1"
                value={aspectRatio}
                options={ASPECT_OPTIONS}
                onChange={(val) => setAspectRatio(val as AspectRatioOption)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary">Frame Rate (FPS)</label>
              <Select
                className="mt-1"
                value={String(fps)}
                options={[
                  { value: '24', label: '24 fps (Cinematic)' },
                  { value: '25', label: '25 fps (PAL / Europe)' },
                  { value: '30', label: '30 fps (Standard Web/Social)' },
                  { value: '60', label: '60 fps (Smooth / High Frame Rate)' },
                ]}
                onChange={(val) => setFps(Number(val))}
              />
            </div>
          </div>
        )}

        {tab === 'story' && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-text-secondary leading-relaxed">
              Open an existing story or animatic production folder. VideoStudio will automatically detect and load approved stills, shot videos, and captured scene durations.
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={handleBrowseStoryFolder}
                disabled={busy}
                className="flex items-center gap-1.5 font-semibold"
              >
                <span className="material-symbols-outlined text-[17px]">folder_open</span>
                <span>Select Story Folder...</span>
              </Button>

              {storyData && (
                <span className="text-xs text-text-secondary truncate max-w-xs font-mono">
                  {storyData.folderPath}
                </span>
              )}
            </div>

            {storyData && (
              <div className="rounded-card border border-hairline bg-bg-surface/50 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">
                      {storyData.episodeTitle || storyData.title}
                    </h4>
                    <span className="text-[11px] text-text-secondary">
                      Aspect Ratio: {storyData.aspectRatio} · 24 fps
                    </span>
                  </div>
                  <span className="rounded-full bg-accent-ai/15 px-2.5 py-0.5 text-xs font-semibold text-accent-ai">
                    {storyData.shots.length} Shots
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-1 text-center text-xs">
                  <div className="rounded bg-bg-canvas p-2 border border-hairline/50">
                    <span className="block font-bold text-accent-ai text-sm">
                      {storyData.totalApprovedStills}
                    </span>
                    <span className="text-[10px] text-text-secondary">Approved Stills</span>
                  </div>
                  <div className="rounded bg-bg-canvas p-2 border border-hairline/50">
                    <span className="block font-bold text-text-primary text-sm">
                      {storyData.totalApprovedVideos}
                    </span>
                    <span className="text-[10px] text-text-secondary">Approved Videos</span>
                  </div>
                  <div className="rounded bg-bg-canvas p-2 border border-hairline/50">
                    <span className="block font-bold text-text-primary text-sm">
                      {storyData.totalDurationSeconds}s
                    </span>
                    <span className="text-[10px] text-text-secondary">Total Duration</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPlaceOnTimeline}
                      onChange={(e) => setAutoPlaceOnTimeline(e.target.checked)}
                      className="rounded border-hairline text-accent-ai focus:ring-accent-ai"
                    />
                    <span className="text-xs text-text-primary font-medium">
                      ⚡ 1-Click: Place shots on timeline immediately
                    </span>
                  </label>

                  {autoPlaceOnTimeline && (
                    <div className="grid grid-cols-2 gap-2 pl-6 pt-1">
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name="placeMode"
                          value="stills_only"
                          checked={placeMode === 'stills_only'}
                          onChange={() => setPlaceMode('stills_only')}
                          className="text-accent-ai focus:ring-accent-ai"
                        />
                        <span>Approved Stills ({storyData.totalApprovedStills})</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name="placeMode"
                          value="videos_only"
                          checked={placeMode === 'videos_only'}
                          onChange={() => setPlaceMode('videos_only')}
                          disabled={storyData.totalApprovedVideos === 0}
                          className="text-accent-ai focus:ring-accent-ai disabled:opacity-50"
                        />
                        <span>Approved Videos ({storyData.totalApprovedVideos})</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name="placeMode"
                          value="hybrid"
                          checked={placeMode === 'hybrid'}
                          onChange={() => setPlaceMode('hybrid')}
                          className="text-accent-ai focus:ring-accent-ai"
                        />
                        <span>Hybrid (Videos + Stills fallback)</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                        <input
                          type="radio"
                          name="placeMode"
                          value="dual_track"
                          checked={placeMode === 'dual_track'}
                          onChange={() => setPlaceMode('dual_track')}
                          className="text-accent-ai focus:ring-accent-ai"
                        />
                        <span>Dual Tracks (V1 Stills + V2 Videos)</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'switch' && (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto py-2">
            {projects.map((proj) => {
              const isCurrent = proj.id === activeProjectId;
              return (
                <div
                  key={proj.id}
                  className={`flex items-center justify-between rounded-card p-3 border transition-colors ${
                    isCurrent
                      ? 'border-accent-ai bg-bg-selected'
                      : 'border-hairline bg-bg-app hover:bg-bg-hover'
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => {
                      setActiveProject(proj.id);
                      onClose();
                    }}
                  >
                    <div className="text-sm font-medium text-text-primary">{proj.name}</div>
                    <div className="text-xs text-text-secondary">
                      {proj.aspectRatio} • {proj.fps} fps •{' '}
                      {new Date(proj.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  {projects.length > 1 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void deleteProject(proj.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-hairline mt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          {tab === 'new' && (
            <Button
              variant="primary"
              disabled={!name.trim() || busy}
              onClick={() => void handleCreate()}
            >
              Create Project
            </Button>
          )}

          {tab === 'story' && storyData && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void handleOpenStoryProject()}
              className="flex items-center gap-1.5 font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              <span>Open & Place on Timeline</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
