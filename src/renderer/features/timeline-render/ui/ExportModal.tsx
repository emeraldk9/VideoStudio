import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  formatTimecode,
  framesToSeconds,
  hasBlockingFindings,
  runPreflight,
  selectTimelineWatermarkTargets,
  type PreflightFinding,
  type RenderAcceleration,
  type RenderAudioBitrate,
  type RenderDeliveryFormat,
  type RenderEncoderInfo,
  type RenderQuality,
  type AudioStemType,
  type SequenceRenderRequest,
  AUDIO_STEM_CONFIGS,
  ALL_STEM_TYPES,
  buildStemExportBatch,
  ASS_SUBTITLE_STYLES,
} from '@shared';

import { useProjectStore } from '../../../entities/project';
import {
  selectDurationFrames,
  useImportedMediaStore,
  useSequenceStore,
} from '../../../entities/sequence';
import { formatIpcError } from '../../../shared/lib/formatIpcError';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import { RenderProgress } from './RenderProgress';
import { RenderQueueDock } from './RenderQueueDock';
import { useRenderQueueStore } from '../model/useRenderQueueStore';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type ExportPresetId = 'youtube' | 'tiktok' | 'master' | 'webm' | 'gif' | 'audio' | 'custom' | string;

export interface ExportPreset {
  id: ExportPresetId;
  name: string;
  badge: string;
  icon: string;
  description: string;
  format: RenderDeliveryFormat;
  quality: RenderQuality;
  draft: boolean;
  outputHeight: number;
  audioBitrate: RenderAudioBitrate;
  audioOnly?: boolean;
  isCustom?: boolean;
}

const CUSTOM_PRESETS_STORAGE_KEY = 'videostudio:custom-export-presets';

export function loadCustomPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => ({ ...p, isCustom: true, icon: p.icon || 'bookmark' }));
    }
    return [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: ExportPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

const PRESETS: ExportPreset[] = [
  {
    id: 'youtube',
    name: 'YouTube & Web',
    badge: 'Recommended',
    icon: 'smart_display',
    description: '1080p Full HD · MP4 · High Bitrate',
    format: 'mp4',
    quality: 'high',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 192,
  },
  {
    id: 'tiktok',
    name: 'TikTok & Reels',
    badge: 'Shorts 9:16',
    icon: 'stay_current_portrait',
    description: 'Vertical 1080p · MP4 · Fast Encoding',
    format: 'mp4',
    quality: 'good',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 192,
  },
  {
    id: 'master',
    name: '4K Ultra Master',
    badge: 'Production UHD',
    icon: 'high_res',
    description: '2160p 4K · High Bitrate Archive',
    format: 'mp4',
    quality: 'high',
    draft: false,
    outputHeight: 2160,
    audioBitrate: 256,
  },
  {
    id: 'webm',
    name: 'WebM Stream',
    badge: 'HTML5 Web',
    icon: 'movie_edit',
    description: '1080p WebM · VP9 / Opus Web Video',
    format: 'webm',
    quality: 'high',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 192,
  },
  {
    id: 'gif',
    name: 'Animated GIF',
    badge: 'Looping',
    icon: 'gif_box',
    description: 'Looping Animation · 720p · No Audio',
    format: 'gif',
    quality: 'good',
    draft: false,
    outputHeight: 720,
    audioBitrate: 128,
  },
  {
    id: 'audio',
    name: 'Audio Soundtrack',
    badge: 'M4A Bed',
    icon: 'audiotrack',
    description: 'M4A Master · 256 kbps Studio Audio',
    format: 'mp4',
    quality: 'high',
    draft: false,
    outputHeight: 0,
    audioBitrate: 256,
    audioOnly: true,
  },
  {
    id: 'prores',
    name: 'Apple ProRes 422 HQ',
    badge: 'Broadcast Master',
    icon: 'video_file',
    description: '10-bit ProRes · MOV · PCM Lossless Audio',
    format: 'prores',
    quality: 'high',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 256,
  },
  {
    id: 'dnxhd',
    name: 'Avid DNxHD / DNxHR',
    badge: 'Post Master',
    icon: 'movie',
    description: 'Avid Broadcast Master · MOV · PCM 16-bit',
    format: 'dnxhd',
    quality: 'high',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 256,
  },
  {
    id: 'hevc',
    name: 'HEVC / H.265 10-bit',
    badge: 'Next-Gen HDR',
    icon: 'hdr_on',
    description: 'High Efficiency 10-bit · MP4 · 50% Size',
    format: 'hevc',
    quality: 'high',
    draft: false,
    outputHeight: 1080,
    audioBitrate: 256,
  },
  {
    id: 'wav-stems',
    name: 'Audio Stems Package',
    badge: 'Lossless 24-bit',
    icon: 'queue_music',
    description: '24-bit 48kHz WAV · DIA / MUS / SFX Stems',
    format: 'wav',
    quality: 'high',
    draft: false,
    outputHeight: 0,
    audioBitrate: 256,
    audioOnly: true,
  },
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const document = useSequenceStore((state) => state.document);
  const progress = useSequenceStore((state) => state.renderProgress);
  const setRenderProgress = useSequenceStore((state) => state.setRenderProgress);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const inPointFrame = useSequenceStore((state) => state.inPointFrame);
  const outPointFrame = useSequenceStore((state) => state.outPointFrame);
  const storyboardReport = useSequenceStore((state) => state.storyboardReport);
  const markers = useSequenceStore((state) => state.markers);
  const importedMedia = useImportedMediaStore((state) => state.media);
  const loadImportedMedia = useImportedMediaStore((state) => state.load);
  const projectId = useProjectStore((state) => state.activeProjectId);
  const pushToast = useToastStore((state) => state.pushToast);

  const hasWorkArea = inPointFrame !== null || outPointFrame !== null;
  const [exportRange, setExportRange] = useState<'entire' | 'workarea'>('entire');

  const [activePreset, setActivePreset] = useState<ExportPresetId>('youtube');
  const [customPresets, setCustomPresets] = useState<ExportPreset[]>(loadCustomPresets);
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [format, setFormat] = useState<RenderDeliveryFormat>('mp4');
  const [outputHeight, setOutputHeight] = useState<number>(0);
  const [quality, setQuality] = useState<RenderQuality>('high');
  const [draft, setDraft] = useState<boolean>(false);
  const [audioBitrate, setAudioBitrate] = useState<RenderAudioBitrate>(192);
  const [duck, setDuck] = useState<boolean>(true);
  const [audioOnly, setAudioOnly] = useState<boolean>(false);
  const [acceleration, setAcceleration] = useState<RenderAcceleration>('auto');
  const [encoder, setEncoder] = useState<RenderEncoderInfo | null>(null);

  // S68 Render Queue & Broadcast Presets
  const [exportStems, setExportStems] = useState<boolean>(false);
  const [selectedStems, setSelectedStems] = useState<AudioStemType[]>(['dialogue', 'music', 'sfx', 'master']);
  const [twoPass, setTwoPass] = useState<boolean>(false);
  const [proresProfile, setProresProfile] = useState<number>(3);
  const queueCount = useRenderQueueStore((state) => state.jobs.length);

  // S73 Subtitle Burn-In Teletext Options
  const [burnInSubtitles, setBurnInSubtitles] = useState<boolean>(false);
  const [subtitleStylePresetId, setSubtitleStylePresetId] = useState<string>('classic_clean');
  const [subtitleTrackId, setSubtitleTrackId] = useState<string>('');

  const [findings, setFindings] = useState<PreflightFinding[] | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [exportedResult, setExportedResult] = useState<{ outputPath: string; via: string } | null>(null);

  const activeRenderSequenceId = useSequenceStore((state) => state.activeRenderSequenceId);
  const renderingThisSequence =
    document !== null && activeRenderSequenceId === document.sequence.id;
  const busy = localBusy || renderingThisSequence;
  const ownProgress =
    progress !== null && progress.sequenceId === document?.sequence.id ? progress : null;

  const fps = document?.sequence.fps ?? 30;
  const width = document?.sequence.width ?? 1920;
  const height = document?.sequence.height ?? 1080;
  const effectiveDurationFrames = useMemo(() => {
    if (exportRange === 'workarea' && hasWorkArea) {
      const start = inPointFrame ?? 0;
      const end = outPointFrame ?? durationFrames;
      return Math.max(0, end - start);
    }
    return durationFrames;
  }, [exportRange, hasWorkArea, inPointFrame, outPointFrame, durationFrames]);
  const durationSec = framesToSeconds(effectiveDurationFrames, fps);
  const aspectRatioStr = `${width}:${height}`;

  const hasSubtitleClips = useMemo(() => {
    return document?.clips.some((clip) => clip.sourceKind === 'text' && Boolean(clip.effects?.text?.text?.trim())) ?? false;
  }, [document?.clips]);

  const textTracks = useMemo(() => {
    return document?.tracks.filter((t) => t.kind === 'video' && t.role === 'text') ?? [];
  }, [document?.tracks]);

  useEffect(() => {
    if (!isOpen) return;
    setExportedResult(null);
    let alive = true;
    void window.api.sequence
      .getEncoder()
      .then((info) => {
        if (alive) setEncoder(info);
      })
      .catch(() => {
        if (alive) setEncoder({ encoderId: 'libx264', label: 'x264', hardware: false, hwaccelId: null });
      });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (projectId && isOpen) {
      void loadImportedMedia(projectId);
    }
  }, [isOpen, loadImportedMedia, projectId]);

  const allPresets = useMemo(() => [...PRESETS, ...customPresets], [customPresets]);

  const applyPreset = (preset: ExportPreset) => {
    setActivePreset(preset.id);
    setFormat(preset.format);
    setQuality(preset.quality);
    setDraft(preset.draft);
    setOutputHeight(preset.outputHeight);
    setAudioBitrate(preset.audioBitrate);
    setAudioOnly(Boolean(preset.audioOnly));
  };

  const handleSaveCustomPreset = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    const customId = `custom-${Date.now()}`;
    const newPreset: ExportPreset = {
      id: customId,
      name: trimmed,
      badge: 'User Preset',
      icon: 'bookmark',
      description: `${outputHeight > 0 ? `${outputHeight}p` : 'Native'} · ${format.toUpperCase()} · ${quality}`,
      format,
      quality,
      draft,
      outputHeight,
      audioBitrate,
      audioOnly,
      isCustom: true,
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setActivePreset(customId);
    setNewPresetName('');
    setShowSavePresetInput(false);
    pushToast({ variant: 'success', message: `Custom preset "${trimmed}" saved!` });
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    if (activePreset === id) {
      applyPreset(PRESETS[0]);
    }
    pushToast({ variant: 'info', message: 'Custom preset deleted.' });
  };

  const estimatedSizeMb = useMemo(() => {
    if (audioOnly) {
      return ((audioBitrate * durationSec) / 8 / 1024).toFixed(1);
    }
    const baseBitrate =
      outputHeight === 2160 ? 32000 : outputHeight === 1440 ? 16000 : outputHeight === 720 ? 4500 : 9000;
    const qFactor = draft ? 0.4 : quality === 'high' ? 1.4 : 1.0;
    const totalBitrate =
      baseBitrate * qFactor + (format === 'gif' || format === 'apng' || format === 'png' ? 0 : audioBitrate);
    return ((totalBitrate * durationSec) / 8 / 1024).toFixed(1);
  }, [audioBitrate, audioOnly, draft, durationSec, format, outputHeight, quality]);

  const check = useCallback(async (): Promise<PreflightFinding[]> => {
    if (!document) return [];
    const paths = [
      ...new Set(
        document.clips
          .map((clip) => clip.filePath)
          .filter((filePath): filePath is string => filePath !== null),
      ),
    ];
    const probes = paths.length > 0 ? await window.api.sequence.probeSources(paths) : {};
    const missingClipIds = document.clips
      .filter((clip) => clip.filePath !== null && probes[clip.filePath] === null)
      .map((clip) => clip.id);
    const geometryMismatchClipIds = document.clips
      .filter((clip) => {
        if (clip.sourceKind !== 'video' || clip.filePath === null) return false;
        const probe = probes[clip.filePath];
        if (!probe?.width || !probe.height) return false;
        return probe.width !== document.sequence.width || probe.height !== document.sequence.height;
      })
      .map((clip) => clip.id);

    const sourceSizeByClipId: Record<string, { width: number; height: number }> = {};
    for (const clip of document.clips) {
      if (clip.sourceKind !== 'still' || clip.filePath === null) continue;
      const probe = probes[clip.filePath];
      if (probe?.width && probe.height) {
        sourceSizeByClipId[clip.id] = { width: probe.width, height: probe.height };
      }
    }

    const mediaIdByPath = new Map(importedMedia.map((file) => [file.path, file.id]));
    const watermarkRefs = selectTimelineWatermarkTargets(document.clips, mediaIdByPath);
    let uncleanedClipIds: string[] = [];
    if (watermarkRefs.length > 0) {
      const known = await window.api.watermark.cleanStatus(watermarkRefs.map((t) => t.ref));
      uncleanedClipIds = watermarkRefs
        .filter((target) => !known[`${target.ref.kind}:${target.ref.sourceId}`])
        .flatMap((target) => target.clipIds);
    }

    const result = runPreflight({
      sequence: document.sequence,
      tracks: document.tracks,
      clips: document.clips,
      missingClipIds,
      geometryMismatchClipIds,
      sourceSizeByClipId,
      uncleanedClipIds,
      markers,
      ...(document.clips.some((clip) => clip.storyShotId)
        ? {
            headingByShotId: storyboardReport.unplacedHeadingByShotId,
            staleShotIds: storyboardReport.staleShotIds,
          }
        : {}),
    });
    setFindings(result);
    return result;
  }, [document, importedMedia, markers, storyboardReport]);

  useEffect(() => {
    if (progress) {
      useRenderQueueStore.getState().updateActiveProgress(progress);
    }
  }, [progress]);

  const handleStartExport = async () => {
    if (!document) return;
    setLocalBusy(true);
    setExportedResult(null);
    try {
      const preflightResults = await check();
      if (hasBlockingFindings(preflightResults)) {
        pushToast({ variant: 'error', message: 'Please resolve missing source files before exporting.' });
        return;
      }

      const ext = exportStems || format === 'wav' ? 'wav' : audioOnly ? 'm4a' : format === 'mp4' ? undefined : format;
      const outputPath = await window.api.sequence.chooseExportPath(document.sequence.name, ext);
      if (!outputPath) {
        setLocalBusy(false);
        return;
      }

      const rendered = await window.api.sequence.render({
        sequenceId: document.sequence.id,
        outputPath,
        draft,
        audioOnly: audioOnly || format === 'wav',
        duckMusicUnderNarration: duck,
        outputHeight: outputHeight > 0 ? outputHeight : undefined,
        quality: quality === 'good' ? undefined : quality,
        audioBitrateKbps: audioBitrate,
        acceleration,
        format: format === 'mp4' ? undefined : format,
        twoPass,
        proresProfile: format === 'prores' ? proresProfile : undefined,
        burnInSubtitles: burnInSubtitles && hasSubtitleClips,
        subtitleStylePresetId: burnInSubtitles ? subtitleStylePresetId : undefined,
        subtitleTrackId: burnInSubtitles && subtitleTrackId ? subtitleTrackId : undefined,
      });

      const via = rendered.encoder?.hardware ? ` via ${rendered.encoder.label}` : '';
      setExportedResult({ outputPath, via });
      pushToast({ variant: 'success', message: `Export completed successfully${via}!` });
    } catch (err) {
      pushToast({ variant: 'error', message: formatIpcError(err, 'Export failed') });
    } finally {
      setLocalBusy(false);
      setRenderProgress(null);
    }
  };

  const handleAddToQueue = async () => {
    if (!document) return;
    try {
      const preflightResults = await check();
      if (hasBlockingFindings(preflightResults)) {
        pushToast({ variant: 'error', message: 'Please resolve missing source files before queueing.' });
        return;
      }

      const ext = exportStems || format === 'wav' ? 'wav' : audioOnly ? 'm4a' : format === 'mp4' ? undefined : format;
      const outputPath = await window.api.sequence.chooseExportPath(document.sequence.name, ext);
      if (!outputPath) return;

      const baseReq: SequenceRenderRequest = {
        sequenceId: document.sequence.id,
        outputPath,
        draft,
        audioOnly: audioOnly || format === 'wav',
        duckMusicUnderNarration: duck,
        outputHeight: outputHeight > 0 ? outputHeight : undefined,
        quality: quality === 'good' ? undefined : quality,
        audioBitrateKbps: audioBitrate,
        acceleration,
        format: format === 'mp4' ? undefined : format,
        twoPass,
        proresProfile: format === 'prores' ? proresProfile : undefined,
        burnInSubtitles: burnInSubtitles && hasSubtitleClips,
        subtitleStylePresetId: burnInSubtitles ? subtitleStylePresetId : undefined,
        subtitleTrackId: burnInSubtitles && subtitleTrackId ? subtitleTrackId : undefined,
      };

      if (exportStems) {
        const batch = buildStemExportBatch(baseReq, selectedStems, undefined, 'wav');
        useRenderQueueStore.getState().enqueueBatch(
          batch.map((req) => ({
            sequenceId: document.sequence.id,
            sequenceName: document.sequence.name,
            presetName: `${AUDIO_STEM_CONFIGS[req.stemType ?? 'master'].label} Stem`,
            request: req,
            outputPath: req.outputPath,
          })),
        );
        pushToast({ variant: 'success', message: `Added ${batch.length} audio stem export jobs to Render Queue!` });
      } else {
        useRenderQueueStore.getState().enqueueJob({
          sequenceId: document.sequence.id,
          sequenceName: document.sequence.name,
          presetName: PRESETS.find((p) => p.id === activePreset)?.name ?? 'Custom Delivery',
          request: baseReq,
          outputPath,
        });
        pushToast({ variant: 'success', message: `Added ${document.sequence.name} to Render Queue!` });
      }

      useRenderQueueStore.getState().toggleQueueDrawer(true);
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: formatIpcError(err, 'Failed to queue export') });
    }
  };

  const handleCancelExport = () => {
    void window.api.sequence.cancelRender();
    setLocalBusy(false);
    setRenderProgress(null);
    pushToast({ variant: 'info', message: 'Export cancelled.' });
  };

  const handleRevealFile = () => {
    if (exportedResult?.outputPath) {
      void window.api.files.showItemInFolder(exportedResult.outputPath);
    }
  };

  const handleCopyPath = () => {
    if (exportedResult?.outputPath) {
      navigator.clipboard.writeText(exportedResult.outputPath);
      pushToast({ variant: 'success', message: 'File path copied to clipboard!' });
    }
  };

  return (
    <>
      <Modal
        open={isOpen}
      onClose={busy ? undefined : onClose}
      size="2xl"
      bodyScroll={false}
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-ai text-[20px]">ios_share</span>
            <span>Export Sequence</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-semibold text-text-primary border border-hairline transition-colors"
            onClick={() => useRenderQueueStore.getState().toggleQueueDrawer(true)}
            title="Open Render Queue & Batch Deliveries"
          >
            <span className="material-symbols-outlined text-[15px]">format_list_bulleted</span>
            <span>Queue</span>
            {queueCount > 0 && (
              <span className="rounded-full bg-accent-ai px-1.5 py-0.2 font-mono text-[9px] font-bold text-black">
                {queueCount}
              </span>
            )}
          </button>
        </div>
      }
    >
      <div className="flex h-[530px] overflow-hidden select-none">
        {/* State 1: Active Rendering Dashboard */}
        {ownProgress ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-bg-canvas/60">
            <div className="w-full max-w-lg flex flex-col gap-6">
              {/* Pulsing Encoding Badge */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-ai/15 text-accent-ai shadow-lg animate-pulse">
                  <span className="material-symbols-outlined text-3xl">hourglass_top</span>
                </div>
                <h3 className="text-base font-bold text-text-primary">Encoding Video...</h3>
                <p className="text-xs text-text-secondary max-w-sm">
                  Rendering <span className="font-semibold text-text-primary">{document?.sequence.name}</span> using{' '}
                  <span className="font-mono text-accent-ai">
                    {encoder?.hardware ? encoder.label : 'CPU Software (x264)'}
                  </span>
                </p>
              </div>

              {/* Phased Progress Stepper */}
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-hairline bg-bg-app/70 p-2 text-[10px] font-mono">
                <div className="flex items-center justify-center gap-1 text-accent-success font-semibold">
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  <span>1. Probe</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-accent-ai font-semibold animate-pulse">
                  <span className="material-symbols-outlined text-[13px]">sync</span>
                  <span>2. Frames</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-text-disabled">
                  <span className="material-symbols-outlined text-[13px]">radio_button_unchecked</span>
                  <span>3. Audio</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-text-disabled">
                  <span className="material-symbols-outlined text-[13px]">radio_button_unchecked</span>
                  <span>4. Mux</span>
                </div>
              </div>

              {/* Main Progress Indicator */}
              <div className="rounded-xl border border-hairline bg-bg-app p-4 shadow-sm">
                <RenderProgress progress={ownProgress} />
              </div>

              <div className="flex justify-center">
                <Button variant="danger" size="sm" onClick={handleCancelExport}>
                  <span className="material-symbols-outlined text-[15px] mr-1">cancel</span>
                  Cancel Export
                </Button>
              </div>
            </div>
          </div>
        ) : exportedResult ? (
          /* State 2: Export Completed */
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-bg-canvas/50">
            <div className="w-full max-w-md flex flex-col items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-success/15 text-accent-success shadow-lg">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Export Successful!</h3>
                <p className="text-xs text-text-secondary mt-1">
                  Video rendered and packaged{exportedResult.via}.
                </p>
              </div>

              {/* Output Path Card */}
              <div className="w-full rounded-xl border border-hairline bg-bg-app p-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                    Target File
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="flex items-center gap-1 text-[11px] text-accent-ai hover:underline"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    <span>Copy</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-text-primary truncate mt-1" title={exportedResult.outputPath}>
                  {exportedResult.outputPath}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="primary" size="sm" onClick={handleRevealFile}>
                  <span className="material-symbols-outlined text-sm mr-1.5">folder_open</span>
                  Reveal in Folder
                </Button>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* State 3: Setup & Presets */
          <>
            {/* Left Summary & Inspection Column */}
            <div className="flex w-80 shrink-0 flex-col gap-3.5 border-r border-hairline bg-bg-app/40 p-4 overflow-y-auto">
              {/* Mini Aspect Ratio Visual Stage */}
              <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-hairline bg-bg-canvas/90 p-4">
                <div
                  className="relative flex items-center justify-center rounded-lg border border-accent-ai/40 bg-accent-ai/10"
                  style={{
                    width: width >= height ? '140px' : '70px',
                    height: width >= height ? '78px' : '124px',
                  }}
                >
                  <span className="material-symbols-outlined text-accent-ai text-2xl">movie</span>
                  <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.2 font-mono text-[9px] text-white">
                    {aspectRatioStr === '1920:1080' ? '16:9' : aspectRatioStr === '1080:1920' ? '9:16' : 'Custom'}
                  </div>
                </div>

                <div className="mt-2 text-center">
                  <span className="block text-xs font-semibold text-text-primary truncate max-w-[220px]">
                    {document?.sequence.name}
                  </span>
                  <span className="font-mono text-[11px] text-text-secondary">
                    {width}×{height} · {fps} FPS
                  </span>
                </div>
              </div>

              {/* Export Range Segmented Control if Work Area is defined */}
              {hasWorkArea && (
                <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-bg-app p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                    Export Range
                  </span>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-bg-canvas p-0.5 border border-hairline/60">
                    <button
                      type="button"
                      onClick={() => setExportRange('entire')}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-all ${
                        exportRange === 'entire'
                          ? 'bg-accent-ai text-text-on-accent font-semibold shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Entire Cut
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportRange('workarea')}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-all ${
                        exportRange === 'workarea'
                          ? 'bg-accent-ai text-text-on-accent font-semibold shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Work Area
                    </button>
                  </div>
                </div>
              )}

              {/* Timecode & Duration */}
              <div className="flex items-center justify-between rounded-lg border border-hairline bg-bg-app px-3 py-2">
                <span className="text-[11px] font-medium text-text-secondary">
                  {exportRange === 'workarea' && hasWorkArea ? 'Work Area Duration' : 'Duration'}
                </span>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-text-primary block">
                    {formatTimecode(effectiveDurationFrames, fps)}
                  </span>
                  {exportRange === 'workarea' && hasWorkArea && (
                    <span className="font-mono text-[10px] text-accent-ai block">
                      {formatTimecode(inPointFrame ?? 0, fps)} – {formatTimecode(outPointFrame ?? durationFrames, fps)}
                    </span>
                  )}
                </div>
              </div>

              {/* File Size Estimate Card */}
              <div className="flex flex-col rounded-xl border border-hairline/60 bg-bg-app p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                    Estimated File Size
                  </span>
                  <span className="rounded bg-accent-ai/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-ai">
                    {format.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="font-mono text-2xl font-bold text-text-primary">~{estimatedSizeMb}</span>
                  <span className="text-xs text-text-secondary font-medium">MB</span>
                </div>
                <span className="text-[10px] text-text-disabled mt-0.5">
                  Calculated based on {durationSec.toFixed(1)}s sequence duration
                </span>
              </div>

              {/* Hardware Accelerator Status */}
              <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-bg-app p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-ai/15 text-accent-ai">
                  <span className="material-symbols-outlined text-[18px]">memory</span>
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-text-primary block leading-tight">Encoder Engine</span>
                  <span className="font-mono text-[10px] text-text-secondary truncate block">
                    {encoder?.hardware ? encoder.label : 'CPU Software (x264)'}
                  </span>
                </div>
              </div>

              {/* Preflight Findings Alert */}
              {findings && findings.length > 0 && (
                <div className="rounded-xl border border-accent-warning/30 bg-accent-warning/10 p-3 text-xs text-accent-warning">
                  <span className="font-semibold block mb-1">Preflight Notice:</span>
                  <p className="text-[11px] leading-tight">{findings[0].message}</p>
                </div>
              )}
            </div>

            {/* Right Presets & Encoding Parameters Column */}
            <div className="flex flex-1 flex-col overflow-y-auto p-5">
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-disabled">Target Presets</h3>
                    <button
                      type="button"
                      onClick={() => setShowSavePresetInput((prev) => !prev)}
                      className="flex items-center gap-1 text-[11px] font-medium text-accent-ai hover:text-accent-ai-hover transition-colors"
                      title="Save current encoding configuration as a reusable preset"
                    >
                      <span className="material-symbols-outlined text-[15px]">bookmark_add</span>
                      <span>Save as Preset</span>
                    </button>
                  </div>

                  {showSavePresetInput ? (
                    <div className="flex items-center gap-2 rounded-xl border border-accent-ai/50 bg-accent-ai/10 p-2.5 mt-2">
                      <input
                        type="text"
                        placeholder="Preset name (e.g. YouTube 4K Pro, Twitter 720p)..."
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCustomPreset();
                          if (e.key === 'Escape') setShowSavePresetInput(false);
                        }}
                        className="flex-1 rounded-lg border border-hairline bg-bg-app px-2.5 py-1 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
                        autoFocus
                      />
                      <Button variant="primary" size="sm" onClick={handleSaveCustomPreset} disabled={!newPresetName.trim()}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowSavePresetInput(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {allPresets.map((p) => {
                      const active = activePreset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={`group relative flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                            active
                              ? 'border-accent-ai bg-accent-ai/10'
                              : 'border-hairline bg-bg-app hover:border-text-disabled hover:bg-bg-hover'
                          }`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              active ? 'bg-accent-ai text-text-on-accent' : 'bg-bg-canvas text-text-secondary'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">{p.icon}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="block text-xs font-semibold text-text-primary truncate">{p.name}</span>
                                <span className="rounded bg-hairline/80 px-1 py-0.2 text-[9px] font-medium text-text-disabled whitespace-nowrap">
                                  {p.badge}
                                </span>
                              </div>
                              {p.isCustom ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="Delete custom preset"
                                  onClick={(e) => handleDeleteCustomPreset(p.id, e)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDeleteCustomPreset(p.id, e as any);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-text-disabled hover:text-accent-danger p-0.5 rounded transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px]">delete</span>
                                </span>
                              ) : null}
                            </div>
                            <span className="block text-[10px] text-text-secondary truncate mt-0.5">
                              {p.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Configuration Section */}
                <div className="border-t border-hairline pt-4 flex flex-col gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-disabled">Encoding Settings</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary">Container Format</label>
                      <Select
                        className="mt-1"
                        value={format}
                        options={[
                          { value: 'mp4', label: 'MP4 (H.264 / AAC)' },
                          { value: 'hevc', label: 'HEVC / H.265 (High Efficiency)' },
                          { value: 'prores', label: 'Apple ProRes (Broadcast Master)' },
                          { value: 'dnxhd', label: 'Avid DNxHD / DNxHR' },
                          { value: 'webm', label: 'WebM (VP9 / Opus)' },
                          { value: 'wav', label: 'WAV 24-bit PCM (Audio Master)' },
                          { value: 'gif', label: 'Animated GIF' },
                          { value: 'apng', label: 'Animated PNG' },
                        ]}
                        onChange={(val) => {
                          setFormat(val as RenderDeliveryFormat);
                          setActivePreset('custom');
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-text-secondary">Output Resolution</label>
                      <Select
                        className="mt-1"
                        value={String(outputHeight)}
                        options={[
                          { value: '0', label: `Native Canvas (${width}×${height})` },
                          { value: '2160', label: '2160p (4K UHD)' },
                          { value: '1440', label: '1440p (2K QHD)' },
                          { value: '1080', label: '1080p (Full HD)' },
                          { value: '720', label: '720p (HD)' },
                        ]}
                        onChange={(val) => {
                          setOutputHeight(Number(val));
                          setActivePreset('custom');
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-text-secondary">Visual Quality Tier</label>
                      <Select
                        className="mt-1"
                        value={quality}
                        options={[
                          { value: 'good', label: 'Standard Web Quality' },
                          { value: 'high', label: 'High Production Master' },
                        ]}
                        onChange={(val) => {
                          setQuality(val as RenderQuality);
                          setActivePreset('custom');
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-text-secondary">Audio Bitrate</label>
                      <Select
                        className="mt-1"
                        value={String(audioBitrate)}
                        options={[
                          { value: '128', label: '128 kbps (Standard)' },
                          { value: '192', label: '192 kbps (High Fidelity)' },
                          { value: '256', label: '256 kbps (Studio Master)' },
                        ]}
                        onChange={(val) => {
                          setAudioBitrate(Number(val) as RenderAudioBitrate);
                          setActivePreset('custom');
                        }}
                      />
                    </div>
                  </div>

                  {/* ProRes Profile dropdown */}
                  {format === 'prores' && (
                    <div className="flex flex-col gap-1 rounded-xl border border-hairline/60 bg-bg-app p-3 mt-1">
                      <label className="text-xs font-medium text-text-primary">Apple ProRes Profile</label>
                      <Select
                        className="mt-1"
                        value={String(proresProfile)}
                        options={[
                          { value: '0', label: 'ProRes 422 Proxy (~45 Mbps)' },
                          { value: '1', label: 'ProRes 422 LT (~102 Mbps)' },
                          { value: '2', label: 'ProRes 422 Standard (~147 Mbps)' },
                          { value: '3', label: 'ProRes 422 HQ Broadcast Master (~220 Mbps)' },
                        ]}
                        onChange={(val) => setProresProfile(Number(val))}
                      />
                      <p className="text-[11px] text-text-disabled mt-1">10-bit YUV 4:2:2 intra-frame master with 24-bit PCM audio.</p>
                    </div>
                  )}

                  {/* Two-Pass VBR Encoding */}
                  {(format === 'mp4' || format === 'hevc') && (
                    <div className="flex items-center justify-between border-t border-hairline pt-3 mt-1">
                      <div>
                        <label className="text-xs font-medium text-text-primary">Two-Pass VBR Encoding</label>
                        <p className="text-[11px] text-text-disabled">Deep scene analysis pass for optimal rate-distortion distribution</p>
                      </div>
                      <Switch checked={twoPass} label="Two-pass VBR" onChange={() => setTwoPass(!twoPass)} />
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-hairline pt-3 mt-1">
                    <div>
                      <label className="text-xs font-medium text-text-primary">Draft Fast Preview Render</label>
                      <p className="text-[11px] text-text-disabled">Encode at half resolution for ultra-fast check</p>
                    </div>
                    <Switch checked={draft} label="Draft fast render" onChange={() => setDraft(!draft)} />
                  </div>

                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <div>
                      <label className="text-xs font-medium text-text-primary">Music Ducking</label>
                      <p className="text-[11px] text-text-disabled">Automatically dip background music during voice narration</p>
                    </div>
                    <Switch checked={duck} label="Music ducking" onChange={() => setDuck(!duck)} />
                  </div>

                  {/* S73 Subtitle & Teletext Burn-In Section */}
                  {hasSubtitleClips && !audioOnly && format !== 'wav' && (
                    <div className="flex flex-col gap-2.5 rounded-xl border border-hairline/60 bg-bg-app p-3 mt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-accent-ai">subtitles</span>
                            <span>Burn-in Subtitles & Closed Captions</span>
                          </label>
                          <p className="text-[11px] text-text-disabled">
                            Hardcode styled typography captions directly into video stream via ASS teletext filter
                          </p>
                        </div>
                        <Switch
                          checked={burnInSubtitles}
                          label="Burn-in Subtitles"
                          onChange={() => setBurnInSubtitles(!burnInSubtitles)}
                        />
                      </div>

                      {burnInSubtitles && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-text-secondary">Caption Style Preset</label>
                              <Select
                                className="mt-1"
                                value={subtitleStylePresetId}
                                options={Object.values(ASS_SUBTITLE_STYLES).map((s) => ({
                                  value: s.id,
                                  label: s.name,
                                }))}
                                onChange={(val) => setSubtitleStylePresetId(val)}
                              />
                            </div>
                            {textTracks.length > 1 ? (
                              <div>
                                <label className="text-xs font-medium text-text-secondary">Source Track</label>
                                <Select
                                  className="mt-1"
                                  value={subtitleTrackId}
                                  options={[
                                    { value: '', label: 'All Subtitle Tracks' },
                                    ...textTracks.map((t) => ({ value: t.id, label: t.name })),
                                  ]}
                                  onChange={(val) => setSubtitleTrackId(val)}
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="text-xs font-medium text-text-secondary">Preset Styling</label>
                                <div className="mt-1 text-[11px] text-text-disabled bg-bg-canvas/40 px-2.5 py-1.5 rounded-lg border border-hairline truncate">
                                  {ASS_SUBTITLE_STYLES[subtitleStylePresetId]?.description ?? 'Custom typography style'}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Live Subtitle Typography Preview Chip */}
                          <div className="mt-1 flex flex-col gap-1 rounded-lg border border-hairline/40 bg-black/60 p-2.5 overflow-hidden">
                            <span className="text-[10px] font-mono text-text-disabled uppercase tracking-wider">
                              Preview Typography
                            </span>
                            <div className="h-10 w-full flex items-center justify-center rounded bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/5 relative select-none">
                              {subtitleStylePresetId === 'cinema_gold' && (
                                <span className="font-serif italic text-sm text-[#fef08a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                                  The cinematic dialogue appears in warm gold.
                                </span>
                              )}
                              {subtitleStylePresetId === 'yellow_broadcast' && (
                                <span className="font-sans font-black text-sm text-[#ffff00] drop-shadow-[0_0_2px_#000] [text-shadow:_1px_1px_0_#000,_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000]">
                                  HIGH-VISIBILITY BROADCAST CAPTION
                                </span>
                              )}
                              {subtitleStylePresetId === 'tiktok_box' && (
                                <span className="font-sans font-bold text-xs text-white bg-black/80 px-2 py-0.5 rounded-sm border border-black">
                                  Viral social media subtitle pill box
                                </span>
                              )}
                              {subtitleStylePresetId === 'retro_teletext' && (
                                <span className="font-mono text-xs text-[#00ffff] bg-black px-1.5 py-0.5 tracking-wider">
                                  PAGE 888 ■ TELETEXT CLOSED CAPTION
                                </span>
                              )}
                              {subtitleStylePresetId === 'classic_clean' && (
                                <span className="font-sans font-bold text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                                  Classic clean subtitle overlay
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audio Stems Batch Delivery */}
                  <div className="flex flex-col gap-2.5 rounded-xl border border-hairline/60 bg-bg-app p-3 mt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-accent-ai">graphic_eq</span>
                          <span>Export Multi-Track Audio Stems</span>
                        </label>
                        <p className="text-[11px] text-text-disabled">Batch export uncompressed 24-bit 48kHz WAV stems routed by track submix buses</p>
                      </div>
                      <Switch checked={exportStems} label="Export Stems" onChange={() => setExportStems(!exportStems)} />
                    </div>

                    {exportStems && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-hairline">
                        {(['dialogue', 'music', 'sfx', 'master'] as AudioStemType[]).map((stem) => {
                          const cfg = AUDIO_STEM_CONFIGS[stem];
                          const isChecked = selectedStems.includes(stem);
                          return (
                            <label
                              key={stem}
                              className={`flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer transition-all ${
                                isChecked
                                  ? 'border-accent-ai bg-accent-ai/10 text-text-primary'
                                  : 'border-hairline bg-bg-canvas/50 text-text-secondary hover:text-text-primary'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStems([...selectedStems, stem]);
                                  } else {
                                    if (selectedStems.length > 1) {
                                      setSelectedStems(selectedStems.filter((s) => s !== stem));
                                    }
                                  }
                                }}
                                className="accent-accent-ai"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold block leading-tight">{cfg.label}</span>
                                <span className="text-[10px] text-text-disabled block truncate">{cfg.description}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Controls */}
      {!ownProgress && !exportedResult && (
        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 bg-bg-app">
          <span className="text-xs text-text-disabled font-mono">
            Destination chosen via native explorer dialog
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !document}
              onClick={handleAddToQueue}
              className="flex items-center gap-1.5 font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">playlist_add</span>
              <span>Add to Queue</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !document}
              onClick={handleStartExport}
              className="flex items-center gap-1.5 font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
              <span>Export Video</span>
            </Button>
          </div>
        </div>
      )}
    </Modal>
    <RenderQueueDock />
    </>
  );
}
