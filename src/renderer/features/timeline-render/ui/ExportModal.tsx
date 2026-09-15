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
} from '@shared';

import { useProjectStore } from '../../../entities/project';
import {
  selectDurationFrames,
  useImportedMediaStore,
  useSequenceStore,
} from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import { RenderProgress } from './RenderProgress';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportPresetId = 'youtube' | 'tiktok' | 'master' | 'webm' | 'gif' | 'audio' | 'custom';

interface ExportPreset {
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
];

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const document = useSequenceStore((state) => state.document);
  const progress = useSequenceStore((state) => state.renderProgress);
  const setRenderProgress = useSequenceStore((state) => state.setRenderProgress);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const storyboardReport = useSequenceStore((state) => state.storyboardReport);
  const markers = useSequenceStore((state) => state.markers);
  const importedMedia = useImportedMediaStore((state) => state.media);
  const loadImportedMedia = useImportedMediaStore((state) => state.load);
  const projectId = useProjectStore((state) => state.activeProjectId);
  const pushToast = useToastStore((state) => state.pushToast);

  const [activePreset, setActivePreset] = useState<ExportPresetId>('youtube');
  const [format, setFormat] = useState<RenderDeliveryFormat>('mp4');
  const [outputHeight, setOutputHeight] = useState<number>(0);
  const [quality, setQuality] = useState<RenderQuality>('high');
  const [draft, setDraft] = useState<boolean>(false);
  const [audioBitrate, setAudioBitrate] = useState<RenderAudioBitrate>(192);
  const [duck, setDuck] = useState<boolean>(true);
  const [audioOnly, setAudioOnly] = useState<boolean>(false);
  const [acceleration, setAcceleration] = useState<RenderAcceleration>('auto');
  const [encoder, setEncoder] = useState<RenderEncoderInfo | null>(null);

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
  const durationSec = framesToSeconds(durationFrames, fps);
  const aspectRatioStr = `${width}:${height}`;

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

  const applyPreset = (preset: ExportPreset) => {
    setActivePreset(preset.id);
    setFormat(preset.format);
    setQuality(preset.quality);
    setDraft(preset.draft);
    setOutputHeight(preset.outputHeight);
    setAudioBitrate(preset.audioBitrate);
    setAudioOnly(Boolean(preset.audioOnly));
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

      const ext = audioOnly ? 'm4a' : format === 'mp4' ? undefined : format;
      const outputPath = await window.api.sequence.chooseExportPath(document.sequence.name, ext);
      if (!outputPath) {
        setLocalBusy(false);
        return;
      }

      const rendered = await window.api.sequence.render({
        sequenceId: document.sequence.id,
        outputPath,
        draft,
        audioOnly,
        duckMusicUnderNarration: duck,
        outputHeight: outputHeight > 0 ? outputHeight : undefined,
        quality: quality === 'good' ? undefined : quality,
        audioBitrateKbps: audioBitrate,
        acceleration,
        format: format === 'mp4' ? undefined : format,
      });

      const via = rendered.encoder?.hardware ? ` via ${rendered.encoder.label}` : '';
      setExportedResult({ outputPath, via });
      pushToast({ variant: 'success', message: `Export completed successfully${via}!` });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setLocalBusy(false);
      setRenderProgress(null);
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
    <Modal
      open={isOpen}
      onClose={busy ? undefined : onClose}
      size="2xl"
      bodyScroll={false}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">ios_share</span>
          <span>Export Sequence</span>
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
              <div className="w-full rounded-xl border border-hairline bg-bg-app p-3 text-left shadow-xs">
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
              <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-hairline bg-bg-canvas/90 p-4 shadow-xs">
                <div
                  className="relative flex items-center justify-center rounded-lg border border-accent-ai/40 bg-accent-ai/10 shadow-inner"
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

              {/* Timecode & Duration */}
              <div className="flex items-center justify-between rounded-lg border border-hairline bg-bg-app px-3 py-2">
                <span className="text-[11px] font-medium text-text-secondary">Duration</span>
                <span className="font-mono text-xs font-bold text-text-primary">
                  {formatTimecode(durationFrames, fps)}
                </span>
              </div>

              {/* File Size Estimate Card */}
              <div className="flex flex-col rounded-xl border border-hairline/60 bg-bg-app p-3 shadow-xs">
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-disabled">Target Presets</h3>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {PRESETS.map((p) => {
                      const active = activePreset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                            active
                              ? 'border-accent-ai bg-accent-ai/10 shadow-xs'
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
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="block text-xs font-semibold text-text-primary">{p.name}</span>
                              <span className="rounded bg-hairline/80 px-1 py-0.2 text-[9px] font-medium text-text-disabled">
                                {p.badge}
                              </span>
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
                          { value: 'webm', label: 'WebM (VP9 / Opus)' },
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
              variant="primary"
              size="sm"
              disabled={busy || !document}
              onClick={handleStartExport}
              className="flex items-center gap-1.5 shadow-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
              <span>Export Video</span>
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
