import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  buildCssFilter,
  clipAtFrame,
  clipSpeed,
  DIP_DEFAULT_COLOR_HEX,
  FLASH_DEFAULT_COLOR_HEX,
  effectiveBoundaryTransition,
  executeLiveMultiCamCut,
  findNextCut,
  findPreviousCut,
  formatTimecode,
  framesToSeconds,
  layoutTrack,
  motionAt,
  composeMatchNudge,
  motionCssTransform,
  resolveClipMotion,
  resolveFilterValues,
  isCompoundClip,
  resolveActiveCompoundFrame,
  resolveWhiteboardDrawSeconds,
  resolveWhiteboardInSeconds,
  snapTargets,
  spineTrackOf,
  timelineSnapTargets,
  toMediaUrl,
  valueAtFrame,
  WHITEBOARD_TRACE_DEFAULTS,
  whiteboardCadenceQuantizeSeconds,
  whiteboardClipPath,
  whiteboardRevealAt,
  whiteboardRows,
  whiteboardTraceFrontAt,
  whiteboardTraceMaskAlpha,
  whiteboardZoneClipPath,
  whiteboardZoneFrontAt,
  whiteboardZoneStateAt,
  type ClipTransition,
  type ClipTransitionParams,
  type PlacedClip,
  type SequenceTrack,
  type TextContent,
  buildVideoEffectStyle,
  videoEffectPresetById,
  type VideoEffectSettings,
  type ClipTransform,
  calculateDuckingEnvelopeGain,
  isClipDuckTarget,
  isTrackDuckTarget,
  clampEqGain,
  clampEqFrequency,
  type AudioEqualizerSettings,
  type AudioCompressorSettings,
  evaluateSpeedAtNormalizedTime,
  calculateRampSourceFrame,
  type SpeedRampSettings,
  buildSvgChromaFilterMatrix,
  buildCssClipPath,
  buildSvgMaskData,
  FONT_FAMILIES,
  calculateTypewriterSlice,
  calculateSpeechTypewriterSlice,
  calculateTextMotionTransform,
  calculateCompoundTextMotion,
  calculateKaraokeHighlight,
  buildCssGridStyle,
  buildCssLensStyle,
  buildCssFilmEmulationStyle,
  collectActiveAdjustmentLayers,
  aggregateAdjustmentFilters,
  buildAdjustmentLayerCssStyles,
  isAdjustmentLayerClip,
  type ActiveAdjustmentLayer,
  ASPECT_RATIO_PRESETS,
  calculateCropFramingBox,
  type TargetAspectRatio,
} from '@shared';

import {
  currentPlayheadFrame,
  useSequenceStore,
  selectDurationFrames,
  transportClock,
} from '../../../entities/sequence';
import { IconButton } from '../../../shared/ui/IconButton';
import { InfoPopover } from '../../../shared/ui/InfoPopover';
import { GlCompositor, type GlSource } from '../lib/gl/GlCompositor';
import { buildFrameGraph, layerFor, planTransition } from '../lib/gl/frame-graph';
import { useWhiteboardTrace, type WhiteboardTraceArtifact } from '../lib/useWhiteboardTrace';
import { whiteboardStillFilter } from '../lib/whiteboardLookFilter';

import { StudioOverlayGuides } from './StudioOverlayGuides';
import { WhiteboardLookDefs } from './WhiteboardLookDefs';
import { TransformGizmo } from './TransformGizmo';
import { useAudioMixerStore } from '../../timeline-edit';
import { stopAudioScrub, triggerAudioScrubGrain } from '../lib/audioScrubEngine';
import { useVideoScopesStore } from '../model/videoScopesStore';
import { VideoScopesModal } from './VideoScopesModal';
import { MultiCamGrid } from './MultiCamGrid';
import { useStylusCaptureStore } from '../model/stylusCaptureStore';
import { StylusRecordingOverlay } from './StylusRecordingOverlay';
import { TimelinePreviewTimecode } from './TimelinePreviewTimecode';
import { InteractiveCropFramingBox } from './InteractiveCropFramingBox';
import { useModalStore } from '../../../shared/model/modalStore';
import { MODAL_IDS } from '../../../shared/config/modal-ids';

function boundaryVisual(
  type: ClipTransition,
  progress: number,
  params: ClipTransitionParams | undefined,
): {
  incoming: React.CSSProperties;
  veil?: { color: string; opacity: number };
} {
  const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
  switch (type) {
    case 'dip_to_color': {
      const color = params?.colorHex ?? DIP_DEFAULT_COLOR_HEX;
      return {
        incoming: { opacity: Math.max(0, progress * 2 - 1) },
        veil: { color, opacity: 1 - Math.abs(progress * 2 - 1) },
      };
    }
    case 'flash_frame':
      return {
        incoming: {},
        veil: { color: params?.colorHex ?? FLASH_DEFAULT_COLOR_HEX, opacity: 1 },
      };
    case 'fade_black':
    case 'fade_white': {
      const color = type === 'fade_white' ? 'white' : 'black';
      return {
        incoming: { opacity: Math.max(0, progress * 2 - 1) },
        veil: { color, opacity: 1 - Math.abs(progress * 2 - 1) },
      };
    }
    case 'wipe_left':
      return { incoming: { clipPath: `inset(0 0 0 ${pct(1 - progress)})` } };
    case 'wipe_right':
      return { incoming: { clipPath: `inset(0 ${pct(1 - progress)} 0 0)` } };
    case 'wipe_up':
      return { incoming: { clipPath: `inset(${pct(1 - progress)} 0 0 0)` } };
    case 'wipe_down':
      return { incoming: { clipPath: `inset(0 0 ${pct(1 - progress)} 0)` } };
    case 'slide_left':
      return { incoming: { transform: `translateX(${pct(1 - progress)})` } };
    case 'slide_right':
      return { incoming: { transform: `translateX(-${pct(1 - progress)})` } };
    case 'slide_up':
      return { incoming: { transform: `translateY(${pct(1 - progress)})` } };
    case 'slide_down':
      return { incoming: { transform: `translateY(-${pct(1 - progress)})` } };
    case 'circle_open':
      return { incoming: { clipPath: `circle(${pct(progress * 0.75)} at 50% 50%)` } };
    default:
      return { incoming: { opacity: progress } };
  }
}

function TraceRevealCanvas({
  artifact,
  stillUrl,
  progress,
  filter,
}: {
  artifact: WhiteboardTraceArtifact;
  stillUrl: string;
  progress: number;
  filter?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<ImageData | null>(null);
  const [imageTick, setImageTick] = useState(0);

  useEffect(() => {
    const image = new Image();
    image.src = stillUrl;
    image.onload = () => {
      imageRef.current = image;
      setImageTick((tick) => tick + 1);
    };
    return () => {
      image.onload = null;
      imageRef.current = null;
    };
  }, [stillUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height, map } = artifact;
    let mask = maskRef.current;
    if (mask?.width !== width || mask?.height !== height) {
      mask = context.createImageData(width, height);
      maskRef.current = mask;
    }
    if (!mask) return;
    const data = mask.data;
    for (let i = 0; i < map.length; i += 1) {
      data[i * 4 + 3] = Math.round(whiteboardTraceMaskAlpha(map[i], progress) * 255);
    }
    context.clearRect(0, 0, width, height);
    context.putImageData(mask, 0, 0);
    context.globalCompositeOperation = 'source-in';
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    context.globalCompositeOperation = 'source-over';
  }, [artifact, progress, imageTick]);

  return (
    <canvas
      ref={canvasRef}
      width={artifact.width}
      height={artifact.height}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ filter }}
    />
  );
}

export function TimelinePreview() {
  const document = useSequenceStore((state) => state.document);
  const storedFrame = useSequenceStore((state) => state.playheadFrame);
  const playing = useSequenceStore((state) => state.playing);
  const playbackRate = useSequenceStore((state) => state.playbackRate);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const setPlaying = useSequenceStore((state) => state.setPlaying);
  const isStylusActive = useStylusCaptureStore((state) => state.isStylusModeActive);
  const openStylusMode = useStylusCaptureStore((state) => state.openStylusMode);
  const closeStylusMode = useStylusCaptureStore((state) => state.closeStylusMode);
  const toggleStylusMode = () => (isStylusActive ? closeStylusMode() : openStylusMode());
  const markers = useSequenceStore((state) => state.markers);
  const inPointFrame = useSequenceStore((state) => state.inPointFrame);
  const outPointFrame = useSequenceStore((state) => state.outPointFrame);
  const looping = useSequenceStore((state) => state.looping);
  const toggleLooping = useSequenceStore((state) => state.toggleLooping);
  const audioScrubEnabled = useSequenceStore((state) => state.audioScrubEnabled);
  const masterVolumeDb = useAudioMixerStore((state) => state.masterVolumeDb);
  const trackMixer = useAudioMixerStore((state) => state.trackMixer);
  const ducking = useAudioMixerStore((state) => state.ducking);
  const setCurrentGainReductionDb = useAudioMixerStore((state) => state.setCurrentGainReductionDb);
  const trackEq = useAudioMixerStore((state) => state.trackEq);
  const trackCompressor = useAudioMixerStore((state) => state.trackCompressor);
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const select = useSequenceStore((state) => state.select);
  const patchClip = useSequenceStore((state) => state.patchClip);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stillImgRef = useRef<HTMLImageElement | null>(null);
  const underlayImgRef = useRef<HTMLImageElement | null>(null);
  const underlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<GlCompositor | null>(null);
  const overlayVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const rafRef = useRef<number | null>(null);

  const [playbackCutFrame, setPlaybackCutFrame] = useState(storedFrame);
  const activeClipIdRef = useRef<string | null>(null);
  const lastGainReductionRef = useRef<number>(0);

  // Studio Safe Areas & Guide Overlays
  const [safeAreas, setSafeAreas] = useState(false);
  const [thirdsGrid, setThirdsGrid] = useState(false);
  const [socialZones, setSocialZones] = useState(false);

  // S173: Multi-Format Social Auto-Reframe Interactive Framing
  const [reframeAspect, setReframeAspect] = useState<TargetAspectRatio | null>(null);
  const [reframeCropPan, setReframeCropPan] = useState<{ panX: number; panY: number }>({ panX: 0, panY: 0 });

  const currentCropBox = useMemo(() => {
    if (!reframeAspect || !document?.sequence.width || !document?.sequence.height) return null;
    return calculateCropFramingBox(
      document.sequence.width,
      document.sequence.height,
      reframeAspect,
      reframeCropPan.panX,
      reframeCropPan.panY,
    );
  }, [reframeAspect, document?.sequence.width, document?.sequence.height, reframeCropPan.panX, reframeCropPan.panY]);

  // S65 — MultiCam 4-Up Synchronized Canvas Quad View Toggle
  const [multiCamViewEnabled, setMultiCamViewEnabled] = useState(false);

  const isScopesOpen = useVideoScopesStore((state) => state.isOpen);
  const toggleScopes = useVideoScopesStore((state) => state.toggleIsOpen);

  const fps = document?.sequence.fps ?? 24;
  const clips = useMemo(() => document?.clips ?? [], [document]);
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);
  const spineTrack = document ? spineTrackOf(document) : null;

  // S162: Pre-compute and memoize trackLayoutMap once per document/clips change
  // to eliminate redundant layoutTrack loops across all tracks and frames.
  const trackLayoutMap = useMemo(() => {
    if (!document) return new Map<string, PlacedClip[]>();
    const map = new Map<string, PlacedClip[]>();
    for (const track of document.tracks) {
      map.set(track.id, layoutTrack(clips, track));
    }
    return map;
  }, [clips, document]);

  const videoLane = useMemo(
    () => (spineTrack?.videoEnabled ? trackLayoutMap.get(spineTrack.id) ?? [] : []),
    [spineTrack, trackLayoutMap],
  );

  // Sync playbackCutFrame to storedFrame on pause / seek
  useEffect(() => {
    if (!playing) {
      setPlaybackCutFrame(storedFrame);
      const placed = clipAtFrame(videoLane, storedFrame);
      activeClipIdRef.current = placed?.clip.id ?? '__gap__';
    }
  }, [playing, storedFrame, videoLane]);

  const playheadFrame = playing && transportClock.running ? playbackCutFrame : storedFrame;
  const current: PlacedClip | null = clipAtFrame(videoLane, playheadFrame);
  const currentRef = useRef<PlacedClip | null>(current);
  currentRef.current = current;
  const audioPlacedRef = useRef<PlacedClip[]>([]);

  // S176 — Live Hardware Playback & Dropped Frame Telemetry
  const [liveFps, setLiveFps] = useState<number>(fps);
  const [droppedFrames, setDroppedFrames] = useState<number>(0);
  const fpsSampleCountRef = useRef(0);
  const lastFpsSampleTimeRef = useRef(performance.now());

  // S65 — Resolve current active MultiCam clip under playhead on spine track
  const currentMultiCamClip = useMemo(() => {
    if (!current?.clip?.effects?.multiCam?.enabled || (current.clip.effects.multiCam.angles?.length ?? 0) <= 1) {
      return null;
    }
    return current.clip;
  }, [current]);

  const handleMultiCamCut = useCallback(
    (targetAngleIndex: number) => {
      if (!currentMultiCamClip || !document) return;
      const updatedClips = executeLiveMultiCamCut(
        clips,
        document.tracks,
        currentMultiCamClip.id,
        playheadFrame,
        targetAngleIndex,
        () => `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      );
      commitClips(updatedClips.clips);
    },
    [currentMultiCamClip, document, clips, playheadFrame, commitClips],
  );

  // S65 — Keyboard shortcuts: Shift+0 to toggle quad view, 1-4 to cut angle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.shiftKey && (e.key === ')' || e.key === '0')) {
        e.preventDefault();
        setMultiCamViewEnabled((prev) => !prev);
        return;
      }
      if (multiCamViewEnabled && currentMultiCamClip && ['1', '2', '3', '4'].includes(e.key)) {
        const angleIdx = parseInt(e.key, 10) - 1;
        const angles = currentMultiCamClip.effects?.multiCam?.angles ?? [];
        if (angleIdx >= 0 && angleIdx < angles.length) {
          e.preventDefault();
          handleMultiCamCut(angleIdx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [multiCamViewEnabled, currentMultiCamClip, handleMultiCamCut]);

  const boundary = useMemo(() => {
    if (!current) return null;
    const index = videoLane.indexOf(current);
    if (index <= 0) return null;
    const previous = videoLane[index - 1];
    const effective = effectiveBoundaryTransition(current.clip, previous.clip);
    if (effective.type === 'cut' || effective.frames <= 0) return null;
    const intoClip = playheadFrame - current.startFrames;
    if (intoClip < 0 || intoClip >= effective.frames) return null;
    return {
      type: effective.type,
      progress: Math.min(1, (intoClip + 1) / effective.frames),
      previous,
    };
  }, [current, videoLane, playheadFrame]);

  const boundaryLook =
    boundary && current
      ? boundaryVisual(boundary.type, boundary.progress, current.clip.effects?.transition)
      : null;

  const underlayUrl =
    boundary?.previous.clip.sourceKind === 'still'
      ? toMediaUrl(boundary.previous.clip.filePath)
      : undefined;
  const underlayMotion = boundary
    ? resolveClipMotion(
        boundary.previous.clip.motionPreset,
        boundary.previous.clip.effects?.motion,
        boundary.previous.clip.durationFrames,
        fps,
      )
    : undefined;

  const overlayStack = useMemo(() => {
    const overlayTracks = (document?.tracks ?? [])
      .filter(
        (track) =>
          track.kind === 'video' &&
          track.videoEnabled &&
          track.id !== document?.sequence.spineTrackId,
      )
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return overlayTracks
      .map((track) => clipAtFrame(trackLayoutMap.get(track.id) ?? [], playheadFrame))
      .filter((placed): placed is PlacedClip => placed !== null)
      .filter((placed) => placed.clip.sourceKind !== 'effect');
  }, [document, trackLayoutMap, playheadFrame]);

  // S62 — Adjustment Layers with layout map caching
  const activeAdjustmentLayers = useMemo(() => {
    if (!document) return [];
    const videoTracks = document.tracks.filter((t) => t.kind === 'video' && t.videoEnabled !== false);
    const active: ActiveAdjustmentLayer[] = [];
    for (const track of videoTracks) {
      const placedClips = trackLayoutMap.get(track.id) ?? [];
      for (const placed of placedClips) {
        if (
          isAdjustmentLayerClip(placed.clip) &&
          playheadFrame >= placed.startFrames &&
          playheadFrame < placed.endFrames
        ) {
          active.push({
            clip: placed.clip,
            track,
            startFrames: placed.startFrames,
            endFrames: placed.endFrames,
          });
        }
      }
    }
    return active.sort((a, b) => (a.track.orderIndex ?? 0) - (b.track.orderIndex ?? 0));
  }, [document, trackLayoutMap, playheadFrame]);

  const frameFilter = useMemo(() => {
    if (activeAdjustmentLayers.length === 0) return undefined;
    const agg = aggregateAdjustmentFilters(activeAdjustmentLayers);
    return agg.trim().length > 0 ? agg : undefined;
  }, [activeAdjustmentLayers]);

  // S181 — sourceAudioVolume
  const sourceAudioVolume = useCallback(
    (placed: PlacedClip, track: SequenceTrack | null | undefined, audible: boolean): number => {
      if (!audible) return 0;
      if (placed.clip.sourceAudioEnabled === false) return 0;
      if (track?.muted) return 0;
      if (soloTrackIds.length > 0 && track && !soloTrackIds.includes(track.id)) return 0;
      const gainDb = valueAtFrame(
        placed.clip.keyframes,
        'volume',
        playheadFrame - placed.startFrames,
        placed.clip.gainDb,
      );
      return Math.min(1, Math.max(0, 10 ** (gainDb / 20)));
    },
    [playheadFrame, soloTrackIds],
  );

  const trackById = useMemo(
    () => new Map((document?.tracks ?? []).map((track) => [track.id, track])),
    [document],
  );

  const audioPlaced = useMemo(() => {
    const audioTracks = (document?.tracks ?? []).filter(
      (track) =>
        track.kind === 'audio' &&
        !track.muted &&
        (soloTrackIds.length === 0 || soloTrackIds.includes(track.id)),
    );
    return audioTracks.flatMap((track) => trackLayoutMap.get(track.id) ?? []);
  }, [document, soloTrackIds, trackLayoutMap]);

  audioPlacedRef.current = audioPlaced;

  // Pre-calculate all visual cut and clip boundaries across all video tracks
  const visualBoundaryFrames = useMemo(() => {
    const frames = new Set<number>([0, durationFrames]);
    if (!document) return [0, durationFrames];
    for (const track of document.tracks) {
      if (track.kind !== 'video' || !track.videoEnabled) continue;
      const trackClips = trackLayoutMap.get(track.id) ?? [];
      for (const placed of trackClips) {
        frames.add(placed.startFrames);
        frames.add(placed.endFrames);
        if (placed.clip.transitionIn !== 'cut' && placed.clip.transitionFrames > 0) {
          frames.add(placed.startFrames + placed.clip.transitionFrames);
        }
      }
    }
    return Array.from(frames).sort((a, b) => a - b);
  }, [document, trackLayoutMap, durationFrames]);

  const visualBoundariesRef = useRef<number[]>(visualBoundaryFrames);
  visualBoundariesRef.current = visualBoundaryFrames;
  const currentSegmentIdxRef = useRef<number>(-1);
  const lastSyncedClipIdRef = useRef<string | null>(null);
  const glActiveRef = useRef<boolean>(false);
  const drawGlFrameRef = useRef<((frame: number) => void) | null>(null);

  // S174: Broadcast Video Scopes Frame Buffer Sampler
  const isScopesOpenRef = useRef(isScopesOpen);
  isScopesOpenRef.current = isScopesOpen;

  const scopesOffscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScopesSampleTimeRef = useRef<number>(0);
  const sampleScopesFrameRef = useRef<() => void>(() => {});

  const sampleScopesFrame = useCallback(() => {
    if (!isScopesOpenRef.current) return;

    let sourceEl: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null = null;
    if (glActiveRef.current && canvasRef.current) {
      sourceEl = canvasRef.current;
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      sourceEl = videoRef.current;
    } else if (stillImgRef.current && stillImgRef.current.complete) {
      sourceEl = stillImgRef.current;
    }

    if (!sourceEl) return;

    const targetW = 160;
    const targetH = 90;

    if (!scopesOffscreenCanvasRef.current && typeof window !== 'undefined') {
      const oc = window.document.createElement('canvas');
      oc.width = targetW;
      oc.height = targetH;
      scopesOffscreenCanvasRef.current = oc;
    }

    const oc = scopesOffscreenCanvasRef.current;
    if (!oc) return;
    const octx = oc.getContext('2d', { willReadFrequently: true });
    if (!octx) return;

    try {
      octx.drawImage(sourceEl, 0, 0, targetW, targetH);
      const imgData = octx.getImageData(0, 0, targetW, targetH);
      useVideoScopesStore.getState().setFrameBuffer({
        data: imgData.data,
        width: targetW,
        height: targetH,
      });
    } catch {
      // Ignore cross-origin canvas exceptions if any
    }
  }, []);

  sampleScopesFrameRef.current = sampleScopesFrame;

  // Transport clock rAF loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const startFrame = useSequenceStore.getState().playheadFrame;
    transportClock.start(startFrame);
    activeClipIdRef.current = currentRef.current?.clip.id ?? '__gap__';

    let anchorFrame = startFrame;
    let anchorPerf = performance.now();
    let lastWbFrame = startFrame;

    // Reset boundary segment index
    const boundaries = visualBoundariesRef.current;
    let initialSeg = 0;
    while (initialSeg < boundaries.length - 1 && startFrame >= boundaries[initialSeg + 1]) {
      initialSeg++;
    }
    currentSegmentIdxRef.current = initialSeg;

    const finish = (frame: number) => {
      transportClock.stop();
      setPlayhead(frame);
      setPlaying(false);
    };

    const tick = () => {
      const now = performance.now();
      const video = videoRef.current;
      let frame: number;

      // S162: Derive playback frame from hardware video element when actively playing to eliminate jitter/drift
      const activePlaced = currentRef.current;
      if (video && activePlaced?.clip.sourceKind === 'video' && !video.paused && video.readyState >= 2) {
        const speed = clipSpeed(activePlaced.clip.effects);
        const sourceInSec = framesToSeconds(activePlaced.clip.sourceInFrames ?? 0, fps);
        const intoClipSec = (video.currentTime - sourceInSec) / speed;
        const videoFrame = activePlaced.startFrames + intoClipSec * fps;
        anchorFrame = videoFrame;
        anchorPerf = now;
        frame = videoFrame;
      } else {
        frame = anchorFrame + ((now - anchorPerf) / 1000) * fps * playbackRate;
      }

      if (frame >= durationFrames) {
        if (looping) {
          const restartFrame = inPointFrame ?? 0;
          transportClock.start(restartFrame);
          setPlayhead(restartFrame);
          anchorFrame = restartFrame;
          anchorPerf = performance.now();
          if (video && currentRef.current?.clip.sourceKind === 'video') {
            const restartPlaced = clipAtFrame(videoLane, restartFrame);
            if (restartPlaced?.clip.sourceKind === 'video') {
              const speed = clipSpeed(restartPlaced.clip.effects);
              const target = framesToSeconds(restartPlaced.clip.sourceInFrames ?? 0, fps);
              video.currentTime = target;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        finish(durationFrames);
        return;
      }
      if (frame <= 0) {
        finish(0);
        return;
      }

      // Check if any visual boundary is crossed across all video tracks
      const currentBoundaries = visualBoundariesRef.current;
      let segIdx = 0;
      while (segIdx < currentBoundaries.length - 1 && frame >= currentBoundaries[segIdx + 1]) {
        segIdx++;
      }
      if (segIdx !== currentSegmentIdxRef.current) {
        currentSegmentIdxRef.current = segIdx;
        setPlaybackCutFrame(Math.round(frame));
      } else {
        const currentPlaced = currentRef.current;
        const isWb = Boolean(currentPlaced?.clip.effects?.whiteboard);
        const isTransition = Boolean(
          currentPlaced &&
            currentPlaced.clip.transitionIn !== 'cut' &&
            currentPlaced.clip.transitionFrames > 0 &&
            frame < currentPlaced.startFrames + currentPlaced.clip.transitionFrames,
        );
        if ((isWb || isTransition) && Math.abs(frame - lastWbFrame) >= 2) {
          lastWbFrame = frame;
          setPlaybackCutFrame(Math.round(frame));
        }
      }

      transportClock.publish(frame);

      // S171: Direct 60fps WebGL frame rendering during active playback when GL shaders/transitions are active
      if (glActiveRef.current) {
        drawGlFrameRef.current?.(frame);
      }

      // S174: Continuous 30fps broadcast video scopes frame buffer sampling during active playback
      if (isScopesOpenRef.current && now - lastScopesSampleTimeRef.current >= 33) {
        lastScopesSampleTimeRef.current = now;
        sampleScopesFrameRef.current();
      }

      // S176: Hardware playback telemetry calculation (FPS & dropped frames)
      fpsSampleCountRef.current++;
      if (now - lastFpsSampleTimeRef.current >= 500) {
        const deltaMs = now - lastFpsSampleTimeRef.current;
        const currentCalculatedFps = (fpsSampleCountRef.current * 1000) / deltaMs;
        lastFpsSampleTimeRef.current = now;
        fpsSampleCountRef.current = 0;
        setLiveFps(Number(currentCalculatedFps.toFixed(1)));

        // Query native video quality if active
        if (videoRef.current && typeof (videoRef.current as any).getVideoPlaybackQuality === 'function') {
          const q = (videoRef.current as any).getVideoPlaybackQuality();
          setDroppedFrames(q.droppedVideoFrames ?? 0);
        }
      }

      // Direct zero-delay audio playback synchronization from rAF loop
      const audible = playbackRate === 1;
      for (const placed of audioPlacedRef.current) {
        const el = audioRefs.current[placed.clip.id];
        if (!el) continue;
        const inside = frame >= placed.startFrames && frame < placed.endFrames;
        if (!inside || !audible) {
          if (!el.paused) el.pause();
        } else {
          const tempo = clipSpeed(placed.clip.effects);
          const target = framesToSeconds(
            (placed.clip.sourceInFrames ?? 0) + (frame - placed.startFrames) * tempo,
            fps,
          );
          if (el.paused) {
            el.currentTime = target;
            void el.play().catch(() => undefined);
          } else {
            const drift = el.currentTime - target;
            if (Math.abs(drift) > 0.8) {
              // S171: Large drift threshold - hard seek only on genuine desync
              el.currentTime = target;
              if (el.playbackRate !== tempo) el.playbackRate = tempo;
            } else if (Math.abs(drift) > 0.08) {
              // S171: Smooth micro-rate nudge catches up or slows down audio without popping or buffer dump
              const nudge = drift > 0 ? 0.96 : 1.04;
              const adjustedRate = tempo * nudge;
              if (Math.abs(el.playbackRate - adjustedRate) > 0.01) {
                el.playbackRate = adjustedRate;
              }
            } else if (el.playbackRate !== tempo) {
              el.playbackRate = tempo;
            }
          }
        }
      }

      // S33 — Throttled Ducking calculation to prevent Zustand cascade during playback
      if (ducking.enabled) {
        const duckingResult = calculateDuckingEnvelopeGain(
          document,
          frame,
          fps,
          ducking,
          trackMixer,
          soloTrackIds,
        );
        if (
          useAudioMixerStore.getState().isOpen &&
          Math.abs(duckingResult.gainDb - lastGainReductionRef.current) > 0.3
        ) {
          lastGainReductionRef.current = duckingResult.gainDb;
          setCurrentGainReductionDb(duckingResult.gainDb);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (transportClock.running) {
        transportClock.stop();
        setPlayhead(transportClock.frame);
      }
    };
  }, [
    playing,
    playbackRate,
    fps,
    durationFrames,
    looping,
    inPointFrame,
    setPlayhead,
    setPlaying,
    videoLane,
    document,
    ducking,
    trackMixer,
    soloTrackIds,
    setCurrentGainReductionDb,
  ]);

  // Video element sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || current?.clip.sourceKind !== 'video') return;
    const intoClip = playheadFrame - current.startFrames;
    const speed = clipSpeed(current.clip.effects);
    const target = framesToSeconds((current.clip.sourceInFrames ?? 0) + intoClip * speed, fps);

    if (!playing) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - target) > 0.04) {
        video.currentTime = target;
      }
      lastSyncedClipIdRef.current = current.clip.id;
      return;
    }

    const realtime = playing && playbackRate === 1;
    video.volume = sourceAudioVolume(current, trackById.get(current.clip.trackId), realtime);
    if (video.playbackRate !== speed * playbackRate) {
      video.playbackRate = speed * playbackRate;
    }
    const isNewClip = lastSyncedClipIdRef.current !== current.clip.id;
    lastSyncedClipIdRef.current = current.clip.id;
    // Prevent seek death spiral: only hard seek on new clip cut or severe drift (> 1.0s)
    if (isNewClip || Math.abs(video.currentTime - target) > 1.0) {
      video.currentTime = target;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }, [current, playheadFrame, playing, playbackRate, fps, sourceAudioVolume, trackById]);

  // Overlay videos sync
  useEffect(() => {
    const realtime = playing && playbackRate === 1;
    for (const placed of overlayStack) {
      if (placed.clip.sourceKind !== 'video') continue;
      const element = overlayVideoRefs.current[placed.clip.id];
      if (!element) continue;
      const intoClip = playheadFrame - placed.startFrames;
      const target = framesToSeconds((placed.clip.sourceInFrames ?? 0) + intoClip, fps);
      element.volume = sourceAudioVolume(placed, trackById.get(placed.clip.trackId), realtime);
      if (realtime) {
        if (Math.abs(element.currentTime - target) > 0.8) element.currentTime = target;
        if (element.paused) void element.play().catch(() => undefined);
        continue;
      }
      if (!element.paused) element.pause();
      if (Math.abs(element.currentTime - target) > 0.06) element.currentTime = target;
    }
  }, [overlayStack, playheadFrame, playing, playbackRate, fps, sourceAudioVolume, trackById]);

  // Audio sync
  useEffect(() => {
    const audible = playing && playbackRate === 1;
    const masterMultiplier = 10 ** (masterVolumeDb / 20);
    const duckingResult = calculateDuckingEnvelopeGain(
      document,
      playheadFrame,
      fps,
      ducking,
      trackMixer,
      soloTrackIds,
    );
    if (
      useAudioMixerStore.getState().isOpen &&
      Math.abs(duckingResult.gainDb - lastGainReductionRef.current) > 0.3
    ) {
      lastGainReductionRef.current = duckingResult.gainDb;
      setCurrentGainReductionDb(duckingResult.gainDb);
    }

    for (const placed of audioPlaced) {
      const element = audioRefs.current[placed.clip.id];
      if (!element) continue;
      const inside = playheadFrame >= placed.startFrames && playheadFrame < placed.endFrames;
      if (!inside || !audible) {
        if (!element.paused) element.pause();
        continue;
      }
      const gainDb = valueAtFrame(
        placed.clip.keyframes,
        'volume',
        playheadFrame - placed.startFrames,
        placed.clip.gainDb,
      );
      const track = trackById.get(placed.clip.trackId);
      const mixerTrack = trackMixer[placed.clip.trackId];
      const mixerGainDb = mixerTrack?.volumeDb ?? 0;
      const trackVol = (track?.volume ?? 1) * 10 ** (mixerGainDb / 20);
      const isDuckTarget = isTrackDuckTarget(track) || isClipDuckTarget(placed.clip, track);
      const duckMult = isDuckTarget ? duckingResult.gainMultiplier : 1;
      const volume = Math.min(
        1,
        Math.max(0, 10 ** (gainDb / 20) * trackVol * masterMultiplier * duckMult),
      );
      element.volume = volume;

      const tempo = clipSpeed(placed.clip.effects);
      // S171: When paused or scrubbing, keep currentTime in sync.
      // During active playback, the rAF loop owns currentTime & smooth playbackRate sync to avoid audio buffer dumps.
      if (!playing) {
        if (element.playbackRate !== tempo) element.playbackRate = tempo;
        const target = framesToSeconds(
          (placed.clip.sourceInFrames ?? 0) + (playheadFrame - placed.startFrames) * tempo,
          fps,
        );
        if (Math.abs(element.currentTime - target) > 0.05) element.currentTime = target;
      }
    }
  }, [
    audioPlaced,
    clips,
    document,
    ducking,
    fps,
    masterVolumeDb,
    playbackRate,
    playheadFrame,
    playing,
    setCurrentGainReductionDb,
    soloTrackIds,
    trackById,
    trackMixer,
  ]);

  // S168 — Compound Clip frame & active children resolution
  const activeCompoundFrame = useMemo(() => {
    if (!current || !isCompoundClip(current.clip)) return null;
    return resolveActiveCompoundFrame({
      compoundClip: current.clip,
      playheadFrame,
      clipStartFrames: current.startFrames,
    });
  }, [current, playheadFrame]);

  const compoundVisualClip = useMemo(() => {
    if (!activeCompoundFrame || activeCompoundFrame.activeChildClips.length === 0) return null;
    return (
      activeCompoundFrame.activeChildClips.find(
        (c) => (c.sourceKind === 'video' || c.sourceKind === 'still') && c.filePath,
      ) ?? null
    );
  }, [activeCompoundFrame]);

  const stillUrl =
    current?.clip.sourceKind === 'still'
      ? toMediaUrl(current.clip.filePath)
      : compoundVisualClip?.sourceKind === 'still'
      ? toMediaUrl(compoundVisualClip.filePath)
      : undefined;
  const videoUrl =
    current?.clip.sourceKind === 'video'
      ? toMediaUrl(current.clip.filePath)
      : compoundVisualClip?.sourceKind === 'video'
      ? toMediaUrl(compoundVisualClip.filePath)
      : undefined;

  const [boxHeight, setBoxHeight] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setBoxHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [liveOverlayTransform, setLiveOverlayTransform] = useState<{
    clipId: string;
    transform: ClipTransform;
  } | null>(null);

  const overlayStyle = (placed: PlacedClip): React.CSSProperties => {
    const liveTransform =
      liveOverlayTransform?.clipId === placed.clip.id ? liveOverlayTransform.transform : null;
    const transform = liveTransform ?? placed.clip.effects?.transform;
    const scaleBox = transform?.scale ?? 1;
    const frame = playheadFrame - placed.startFrames;
    const cx = valueAtFrame(placed.clip.keyframes, 'x', frame, transform?.x ?? 0.5);
    const cy = valueAtFrame(placed.clip.keyframes, 'y', frame, transform?.y ?? 0.5);
    const rot = valueAtFrame(placed.clip.keyframes, 'rotation', frame, transform?.rotation ?? 0);

    const baseStyle: React.CSSProperties = {
      left: `${((cx - scaleBox / 2) * 100).toFixed(3)}%`,
      top: `${((cy - scaleBox / 2) * 100).toFixed(3)}%`,
      width: `${(scaleBox * 100).toFixed(3)}%`,
      height: `${(scaleBox * 100).toFixed(3)}%`,
      opacity: transform?.opacity,
      transform: rot !== 0 ? `rotate(${rot}deg)` : undefined,
      filter: buildCssFilter(placed.clip.effects) || undefined,
    };

    if (placed.clip.effects?.pipGrid?.enabled) {
      Object.assign(baseStyle, buildCssGridStyle(placed.clip.effects.pipGrid));
    }
    if (placed.clip.effects?.lensOptics?.enabled) {
      Object.assign(baseStyle, buildCssLensStyle(placed.clip.effects.lensOptics));
    }
    if (placed.clip.effects?.filmEmulation?.enabled) {
      Object.assign(baseStyle, buildCssFilmEmulationStyle(placed.clip.effects.filmEmulation));
    }
    if (placed.clip.effects?.mask?.enabled && placed.clip.effects.mask.shape !== 'none') {
      baseStyle.clipPath = buildCssClipPath(placed.clip.effects.mask);
    }
    return baseStyle;
  };

  const textDragRef = useRef<{
    clipId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originPct: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const [textDragPct, setTextDragPct] = useState<{
    clipId: string;
    x: number;
    y: number;
    snapped: { x: boolean; y: boolean };
  } | null>(null);

  const SNAP_STOPS = [1 / 3, 0.5, 2 / 3];
  const SNAP_TOLERANCE = 0.015;

  const applyTextDrag = (event: React.PointerEvent): { x: number; y: number; snapped: { x: boolean; y: boolean } } | null => {
    const drag = textDragRef.current;
    const bounds = boxRef.current?.getBoundingClientRect();
    if (!drag || !bounds || bounds.width === 0 || bounds.height === 0) return null;
    let dx = (event.clientX - drag.startX) / bounds.width;
    let dy = (event.clientY - drag.startY) / bounds.height;
    if (event.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let x = Math.min(1, Math.max(0, drag.originPct.x + dx));
    let y = Math.min(1, Math.max(0, drag.originPct.y + dy));
    const snapped = { x: false, y: false };
    if (!event.altKey) {
      for (const stop of SNAP_STOPS) {
        if (Math.abs(x - stop) < SNAP_TOLERANCE) {
          x = stop;
          snapped.x = true;
        }
        if (Math.abs(y - stop) < SNAP_TOLERANCE) {
          y = stop;
          snapped.y = true;
        }
      }
    }
    return { x, y, snapped };
  };

  const renderText = (
    clipId: string,
    effectsText: TextContent | undefined,
    startFrames = 0,
    durationFrames = 30
  ) => {
    if (!effectsText || !document) return null;
    const textScale = boxHeight > 0 ? boxHeight / document.sequence.height : 0;
    if (textScale === 0) return null;
    const draggable = selectedClipIds.length === 1 && selectedClipIds[0] === clipId;
    const live = textDragPct?.clipId === clipId ? textDragPct : null;
    const anchor = effectsText.anchor ?? 'middle';
    const translateY = anchor === 'top' ? '0' : anchor === 'bottom' ? '-100%' : '-50%';
    const frameInClip = playheadFrame - startFrames;

    const targetClip = document.clips.find((c) => c.id === clipId);
    const keyframeX = targetClip?.keyframes
      ? valueAtFrame(targetClip.keyframes, 'x', frameInClip, effectsText.positionPct.x)
      : undefined;
    const keyframeY = targetClip?.keyframes
      ? valueAtFrame(targetClip.keyframes, 'y', frameInClip, effectsText.positionPct.y)
      : undefined;

    const posX = live?.x ?? (keyframeX !== undefined ? keyframeX : effectsText.positionPct.x);
    const posY = live?.y ?? (keyframeY !== undefined ? keyframeY : effectsText.positionPct.y);
    const position = { x: posX, y: posY };
    const isSpeechTypewriter =
      effectsText.animation?.type === 'typewriter_speech' ||
      effectsText.compoundAnimation?.inAnimation === 'typewriter_speech';
    const typewriterDur =
      effectsText.animation?.type === 'typewriter_speech'
        ? effectsText.animation.durationFrames
        : effectsText.compoundAnimation?.inDurationFrames ?? 45;

    let displayedText = effectsText.text;
    if (isSpeechTypewriter) {
      const speechRes = calculateSpeechTypewriterSlice(effectsText.text, frameInClip, typewriterDur, true);
      displayedText = speechRes.text + speechRes.cursor;
    } else if (effectsText.animation?.type === 'typewriter') {
      displayedText = calculateTypewriterSlice(effectsText.text, frameInClip, effectsText.animation.durationFrames);
    }

    const motionState = calculateCompoundTextMotion(effectsText, frameInClip, durationFrames, fps);

    const fontDef = effectsText.fontFamily
      ? FONT_FAMILIES.find((f) => f.family === effectsText.fontFamily)
      : undefined;

    const strokeStyle =
      effectsText.stroke && effectsText.stroke.widthPx > 0
        ? `${Math.max(1, Math.round(effectsText.stroke.widthPx * textScale))}px ${effectsText.stroke.colorHex}`
        : undefined;

    const shadowParts: string[] = [];
    if (motionState.textShadow) {
      shadowParts.push(motionState.textShadow);
    }
    if (effectsText.shadow && (effectsText.shadow.blurPx > 0 || effectsText.shadow.opacity > 0)) {
      const sx = Math.round(effectsText.shadow.offsetX * textScale);
      const sy = Math.round(effectsText.shadow.offsetY * textScale);
      const sb = Math.round(effectsText.shadow.blurPx * textScale);
      const hex = effectsText.shadow.colorHex;
      const alpha = effectsText.shadow.opacity;
      const r = parseInt(hex.slice(1, 3), 16) || 0;
      const g = parseInt(hex.slice(3, 5), 16) || 0;
      const b = parseInt(hex.slice(5, 7), 16) || 0;
      shadowParts.push(`${sx}px ${sy}px ${sb}px rgba(${r}, ${g}, ${b}, ${alpha})`);
    }
    if (effectsText.glow && effectsText.glow.radiusPx > 0 && effectsText.glow.intensity > 0) {
      const gb = Math.round(effectsText.glow.radiusPx * textScale);
      const hex = effectsText.glow.colorHex;
      const alpha = effectsText.glow.intensity;
      const r = parseInt(hex.slice(1, 3), 16) || 0;
      const g = parseInt(hex.slice(3, 5), 16) || 0;
      const b = parseInt(hex.slice(5, 7), 16) || 0;
      shadowParts.push(`0 0 ${gb}px rgba(${r}, ${g}, ${b}, ${alpha})`);
      shadowParts.push(
        `0 0 ${Math.round(gb * 1.5)}px rgba(${r}, ${g}, ${b}, ${(alpha * 0.6).toFixed(2)})`
      );
    }
    const textShadow = shadowParts.length > 0 ? shadowParts.join(', ') : undefined;

    const isGradient = Boolean(effectsText.gradient?.enabled);
    const gradientBg = isGradient
      ? `linear-gradient(${effectsText.gradient?.angleDeg ?? 90}deg, ${effectsText.gradient?.fromHex}, ${effectsText.gradient?.toHex})`
      : undefined;

    const karaokeState =
      effectsText.animation?.type === 'karaoke_highlight'
        ? calculateKaraokeHighlight(displayedText, frameInClip, durationFrames)
        : null;

    return (
      <div
        key={`text-${clipId}`}
        aria-hidden={draggable ? undefined : 'true'}
        className={`absolute whitespace-pre-wrap ${
          draggable
            ? 'cursor-move ring-1 ring-accent-ai/60 pointer-events-auto touch-none'
            : 'pointer-events-none'
        }`}
        style={{
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
          transform: [
            `translate(${
              effectsText.align === 'center' ? '-50%' : effectsText.align === 'right' ? '-100%' : '0'
            }, ${translateY})`,
            motionState.transform,
          ]
            .filter(Boolean)
            .join(' '),
          fontSize: `${effectsText.fontSizePx * textScale}px`,
          color: isGradient ? undefined : effectsText.colorHex,
          fontFamily: fontDef ? fontDef.cssFont : "'Inter', sans-serif",
          fontWeight: effectsText.fontWeight ? parseInt(effectsText.fontWeight, 10) : 700,
          fontStyle: effectsText.italic ? 'italic' : 'normal',
          textDecoration: effectsText.underline ? 'underline' : 'none',
          letterSpacing: effectsText.letterSpacingPx ? `${effectsText.letterSpacingPx}px` : undefined,
          lineHeight: effectsText.lineHeight ?? 1.2,
          textAlign: effectsText.align,
          textTransform: effectsText.textTransform ?? 'none',
          WebkitTextStroke: strokeStyle,
          textShadow,
          opacity: motionState.opacity ?? 1,
          backgroundImage: gradientBg,
          WebkitBackgroundClip: isGradient ? 'text' : undefined,
          WebkitTextFillColor: isGradient ? 'transparent' : undefined,
          backgroundColor: effectsText.box
            ? `${effectsText.box.colorHex}${Math.round(effectsText.box.opacity * 255)
                .toString(16)
                .padStart(2, '0')}`
            : undefined,
          padding: effectsText.box ? `${effectsText.box.paddingPx * textScale}px` : undefined,
          borderRadius: effectsText.box?.borderRadiusPx
            ? `${effectsText.box.borderRadiusPx * textScale}px`
            : undefined,
        }}
        onPointerDown={
          draggable
            ? (event) => {
                textDragRef.current = {
                  clipId,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originPct: { x: position.x, y: position.y },
                  moved: false,
                };
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                event.stopPropagation();
              }
            : undefined
        }
        onPointerMove={
          draggable
            ? (event) => {
                const drag = textDragRef.current;
                if (drag?.clipId !== clipId) return;
                if (
                  !drag.moved &&
                  Math.abs(event.clientX - drag.startX) < 3 &&
                  Math.abs(event.clientY - drag.startY) < 3
                ) {
                  return;
                }
                drag.moved = true;
                const next = applyTextDrag(event);
                if (next) setTextDragPct({ clipId, ...next });
              }
            : undefined
        }
        onPointerUp={
          draggable
            ? (event) => {
                const drag = textDragRef.current;
                textDragRef.current = null;
                const live2 = textDragPct;
                setTextDragPct(null);
                if (!drag?.moved || !live2) return;
                const clip = document.clips.find((item) => item.id === clipId);
                if (!clip?.effects?.text) return;
                patchClip(clipId, {
                  effects: {
                    ...clip.effects,
                    text: { ...clip.effects.text, positionPct: { x: live2.x, y: live2.y } },
                  },
                });
                event.preventDefault();
              }
            : undefined
        }
        onPointerCancel={
          draggable
            ? () => {
                textDragRef.current = null;
                setTextDragPct(null);
              }
            : undefined
        }
      >
        {karaokeState ? (
          karaokeState.tokens.map((token, idx) => (
            <span
              key={idx}
              style={{
                color: token.isActive
                  ? '#FFD700'
                  : token.isPast
                    ? effectsText.colorHex
                    : 'rgba(255, 255, 255, 0.45)',
                textShadow: token.isActive
                  ? '0 0 14px rgba(255, 215, 0, 0.9), 0 0 24px rgba(255, 215, 0, 0.6)'
                  : undefined,
                fontWeight: token.isActive ? 900 : undefined,
                transform: token.isActive ? 'scale(1.08)' : undefined,
                display: 'inline-block',
                transition: 'color 0.08s ease, transform 0.08s ease',
              }}
            >
              {token.word}
            </span>
          ))
        ) : effectsText.templateLayout === 'badge_pill' ? (
          <div className="flex items-center gap-2">
            {effectsText.badgeIcon && (
              <span
                className="material-symbols-outlined shrink-0"
                style={{ fontSize: `${effectsText.fontSizePx * 0.7 * textScale}px` }}
              >
                {effectsText.badgeIcon}
              </span>
            )}
            <div className="flex flex-col text-left">
              <span>{displayedText}</span>
              {effectsText.secondaryText && (
                <span
                  style={{
                    fontSize: `${(effectsText.secondaryFontSizePx ?? effectsText.fontSizePx * 0.6) * textScale}px`,
                    color: effectsText.secondaryColorHex ?? 'rgba(255, 255, 255, 0.75)',
                    fontWeight: 600,
                    letterSpacing: 'normal',
                  }}
                >
                  {effectsText.secondaryText}
                </span>
              )}
            </div>
          </div>
        ) : effectsText.secondaryText ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              {effectsText.badgeIcon && (
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{ fontSize: `${effectsText.fontSizePx * 0.65 * textScale}px` }}
                >
                  {effectsText.badgeIcon}
                </span>
              )}
              <span>{displayedText}</span>
            </div>
            <span
              style={{
                fontSize: `${(effectsText.secondaryFontSizePx ?? effectsText.fontSizePx * 0.55) * textScale}px`,
                color: effectsText.secondaryColorHex ?? 'rgba(255, 255, 255, 0.75)',
                fontWeight: 600,
                marginTop: `${3 * textScale}px`,
                letterSpacing: 'normal',
              }}
            >
              {effectsText.secondaryText}
            </span>
          </div>
        ) : (
          displayedText
        )}
      </div>
    );
  };

  const whiteboard = (() => {
    const settings = current?.clip.effects?.whiteboard;
    if (!settings || current?.clip.sourceKind !== 'still') return null;
    const drawSecs = resolveWhiteboardDrawSeconds(settings, current.clip.durationFrames, fps);
    const wbElapsed = whiteboardCadenceQuantizeSeconds(
      framesToSeconds(Math.max(0, playheadFrame - current.startFrames), fps),
      settings,
    );
    const wbProgress = Math.min(1, Math.max(0, wbElapsed / Math.max(1 / 120, drawSecs)));
    if (settings.pattern === 'zones' && settings.zones && settings.zones.length > 0) {
      return {
        progress: wbProgress,
        rows: 1,
        hand: settings.hand,
        look: settings.look,
        zones: settings.zones,
        trace: null,
        front: whiteboardZoneFrontAt(wbProgress, settings.zones),
      };
    }
    const trace =
      settings.pattern === 'trace' ? (settings.trace ?? WHITEBOARD_TRACE_DEFAULTS) : null;
    const rows = trace ? 1 : whiteboardRows(settings);
    const state = whiteboardRevealAt(wbProgress, rows);
    return {
      progress: wbProgress,
      rows,
      hand: settings.hand,
      look: settings.look,
      zones: null,
      trace,
      front: { x: state.frontX, y: state.frontY } as { x: number; y: number } | null,
    };
  })();

  const traceArtifact = useWhiteboardTrace(
    whiteboard?.trace && current?.clip.filePath && document
      ? {
          filePath: current.clip.filePath,
          trace: whiteboard.trace,
          frameWidth: document.sequence.width,
          frameHeight: document.sequence.height,
        }
      : null,
  );

  const wbGlyphFront =
    whiteboard === null
      ? null
      : whiteboard.trace && traceArtifact
        ? whiteboardTraceFrontAt(traceArtifact.penPath, whiteboard.progress)
        : whiteboard.front;

  const resolvedMotion = (() => {
    if (!current) return undefined;
    let curve = resolveClipMotion(
      current.clip.motionPreset,
      current.clip.effects?.motion,
      current.clip.durationFrames,
      fps,
    );
    const match = current.clip.effects?.transition?.match;
    if (
      current.clip.transitionIn === 'match_dissolve' &&
      match &&
      videoLane.indexOf(current) > 0
    ) {
      curve = composeMatchNudge(curve, match.out, match.in, current.clip.transitionFrames);
    }
    return curve;
  })();

  const reframeMotion =
    current &&
    selectedClipIds.length === 1 &&
    selectedClipIds[0] === current.clip.id &&
    current.clip.effects?.motion?.preset === 'reframe'
      ? current.clip.effects.motion
      : null;

  const motionTransform =
    !reframeMotion && resolvedMotion && current
      ? motionCssTransform(
          motionAt(
            resolvedMotion,
            playheadFrame - current.startFrames,
            current.clip.durationFrames,
          ),
        )
      : undefined;

  const [glEnabled, setGlEnabled] = useState(true);
  const [mediaTick, setMediaTick] = useState(0);
  const bumpMedia = useCallback(() => {
    if (!useSequenceStore.getState().playing) {
      setMediaTick((tick) => tick + 1);
    }
    if (isScopesOpenRef.current) {
      sampleScopesFrame();
    }
  }, [sampleScopesFrame]);

  useEffect(() => {
    if (isScopesOpen) {
      sampleScopesFrame();
    }
  }, [isScopesOpen, storedFrame, sampleScopesFrame]);

  const adjustments = useMemo(
    () =>
      (document?.tracks ?? [])
        .filter((track) => track.kind === 'video' && track.videoEnabled)
        .flatMap((track) =>
          (trackLayoutMap.get(track.id) ?? []).filter(
            (placed) =>
              placed.clip.sourceKind === 'effect' &&
              playheadFrame >= placed.startFrames &&
              playheadFrame < placed.endFrames,
          ),
        )
        .map((placed) => resolveFilterValues(placed.clip.effects)),
    [document, trackLayoutMap, playheadFrame],
  );

  const hasGlTransition = boundary !== null;
  const hasGlEffects = Boolean(
    (current?.clip.sourceKind === 'still' && resolvedMotion !== undefined) ||
      current?.clip.effects?.filmEmulation?.enabled ||
      current?.clip.effects?.lensOptics?.enabled ||
      current?.clip.effects?.chromaKey?.enabled ||
      current?.clip.effects?.colorGrade ||
      current?.clip.effects?.mask?.enabled ||
      adjustments.length > 0,
  );

  // S171: Bypass WebGL canvas when standard video plays without active shaders/transitions.
  // This allows native Chromium hardware decoding at 60/120fps with zero texture copy overhead!
  const glActive =
    glEnabled &&
    current !== null &&
    whiteboard === null &&
    reframeMotion === null &&
    (hasGlTransition || hasGlEffects) &&
    (current.clip.sourceKind === 'still' || current.clip.sourceKind === 'video');

  glActiveRef.current = glActive;

  const underlayVideoUrl =
    glActive && boundary?.previous.clip.sourceKind === 'video'
      ? toMediaUrl(boundary.previous.clip.filePath)
      : undefined;

  useEffect(() => {
    const element = underlayVideoRef.current;
    if (!element || boundary?.previous.clip.sourceKind !== 'video') return;
    const outgoing = boundary.previous.clip;
    const speed = clipSpeed(outgoing.effects);
    const target = framesToSeconds(
      (outgoing.sourceInFrames ?? 0) + Math.max(0, outgoing.durationFrames - 1) * speed,
      fps,
    );
    if (Math.abs(element.currentTime - target) > 0.05) element.currentTime = target;
  }, [boundary, fps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!glActive || !canvas) return;
    if (!compositorRef.current) {
      const compositor = GlCompositor.create(canvas);
      if (!compositor) {
        setGlEnabled(false);
        return;
      }
      compositorRef.current = compositor;
    }
    const lose = (): void => setGlEnabled(false);
    canvas.addEventListener('webglcontextlost', lose);
    return () => canvas.removeEventListener('webglcontextlost', lose);
  }, [glActive]);

  useEffect(
    () => () => {
      compositorRef.current?.dispose();
      compositorRef.current = null;
    },
    [],
  );

  const drawGlFrame = useCallback(
    (targetFrame: number) => {
      const compositor = compositorRef.current;
      if (!glActive || !compositor || !current) return;
      if (compositor.isFailed()) {
        setGlEnabled(false);
        return;
      }

      const elementFor = (
        element: HTMLVideoElement | HTMLImageElement | null,
      ): GlSource | null => {
        if (!element) return null;
        const width =
          element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
        const height =
          element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
        return width > 0 && height > 0 ? { element, width, height } : null;
      };

      const incoming = layerFor({
        slot: 'b',
        clipId: current.clip.id,
        motion: resolvedMotion
          ? motionAt(resolvedMotion, targetFrame - current.startFrames, current.clip.durationFrames)
          : undefined,
        effects: current.clip.effects,
        playheadFrame: targetFrame,
      });

      const previous = boundary?.previous.clip;
      const outgoing =
        previous && underlayMotion
          ? layerFor({
              slot: 'a',
              clipId: previous.id,
              motion: motionAt(underlayMotion, previous.durationFrames - 1, previous.durationFrames),
              effects: previous.effects,
              playheadFrame: targetFrame,
            })
          : previous
            ? layerFor({
                slot: 'a',
                clipId: previous.id,
                motion: undefined,
                effects: previous.effects,
                playheadFrame: targetFrame,
              })
            : null;

      const sourceA = elementFor(
        previous?.sourceKind === 'video' ? underlayVideoRef.current : underlayImgRef.current,
      );
      const graph = buildFrameGraph({
        incoming,
        outgoing: boundary && sourceA ? outgoing : null,
        transition: boundary
          ? planTransition(boundary.type, boundary.progress, current.clip.effects?.transition)
          : null,
        adjustments,
      });

      const isCompVideo = compoundVisualClip?.sourceKind === 'video';
      const sourceB = elementFor(
        current.clip.sourceKind === 'video' || isCompVideo ? videoRef.current : stillImgRef.current,
      );
      if (!compositor.draw(graph, { a: graph.transition ? sourceA : null, b: sourceB }, [0, 0, 0])) {
        setGlEnabled(false);
      }
    },
    [
      glActive,
      current,
      resolvedMotion,
      boundary,
      underlayMotion,
      adjustments,
      compoundVisualClip,
    ],
  );

  drawGlFrameRef.current = drawGlFrame;

  useLayoutEffect(() => {
    drawGlFrame(playheadFrame);
  }, [drawGlFrame, playheadFrame, mediaTick]);

  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    return clips.find((c) => c.id === selectedClipIds[0]) ?? null;
  }, [clips, selectedClipIds]);

  const isTransformableSelected = useMemo(() => {
    if (!selectedClip) return false;
    return (
      selectedClip.sourceKind === 'still' ||
      selectedClip.sourceKind === 'video' ||
      selectedClip.sourceKind === 'text'
    );
  }, [selectedClip]);

  const activeVfxClip = useMemo(() => {
    return (document?.tracks ?? [])
      .filter((track) => track.kind === 'video' && track.videoEnabled)
      .flatMap((track) =>
        (trackLayoutMap.get(track.id) ?? []).filter(
          (placed) =>
            placed.clip.sourceKind === 'effect' &&
            playheadFrame >= placed.startFrames &&
            playheadFrame < placed.endFrames &&
            Boolean(placed.clip.effects?.videoEffect && !placed.clip.effects.videoEffect.disabled),
        ),
      )[0]?.clip ?? null;
  }, [document, trackLayoutMap, playheadFrame]);

  const effectiveVfxPreset = activeVfxClip?.effects?.videoEffect
    ? videoEffectPresetById(activeVfxClip.effects.videoEffect.presetId)
    : null;

  const effectiveVfxStyle = useMemo(() => {
    if (!activeVfxClip?.effects?.videoEffect) return undefined;
    return buildVideoEffectStyle(activeVfxClip.effects.videoEffect);
  }, [activeVfxClip]);

  const cuts = useMemo(() => {
    const base = snapTargets(document?.tracks ?? [], clips);
    return timelineSnapTargets({
      base,
      markerFrames: (markers ?? []).map((m) => m.frame),
      playheadFrame: null,
      sequenceEndFrame: durationFrames,
      inPointFrame,
      outPointFrame,
    });
  }, [document, clips, markers, durationFrames, inPointFrame, outPointFrame]);

  const goToPreviousCut = useCallback(() => {
    const prev = findPreviousCut(cuts, playheadFrame);
    setPlayhead(prev);
  }, [cuts, playheadFrame, setPlayhead]);

  const goToNextCut = useCallback(() => {
    const next = findNextCut(cuts, playheadFrame, durationFrames);
    setPlayhead(next);
  }, [cuts, playheadFrame, durationFrames, setPlayhead]);

  const seqWidth = document?.sequence.width ?? 1920;
  const seqHeight = document?.sequence.height ?? 1080;
  const sequenceAspect = `${seqWidth} / ${seqHeight}`;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Monitor Header HUD */}
      <div className="flex items-center justify-between px-1 text-[11px] text-text-secondary select-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono rounded-md bg-bg-app border border-hairline px-2.5 py-1 text-text-secondary text-[11px] shadow-xs">
            <span className="material-symbols-outlined text-[13px] text-accent-ai">aspect_ratio</span>
            <span className="text-text-primary font-medium">{seqWidth}×{seqHeight}</span>
            <span className="text-text-disabled">·</span>
            <span>{seqWidth > seqHeight ? '16:9' : seqWidth === seqHeight ? '1:1' : '9:16'}</span>
            <span className="text-text-disabled">·</span>
            <span>{fps} fps</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Studio Guides & MultiCam Controls */}
          <div className="flex items-center bg-bg-app border border-hairline rounded-md p-0.5 gap-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setSafeAreas((prev) => !prev)}
              className={`h-6 w-6 rounded text-[11px] flex items-center justify-center transition-all ${
                safeAreas
                  ? 'bg-accent-ai/20 text-accent-ai font-medium'
                  : 'text-text-disabled hover:text-text-primary hover:bg-bg-hover'
              }`}
              title="Toggle Safe Areas (Title 90% / Action 93%)"
            >
              <span className="material-symbols-outlined text-[14px]">crop_free</span>
            </button>
            <button
              type="button"
              onClick={() => setThirdsGrid((prev) => !prev)}
              className={`h-6 w-6 rounded text-[11px] flex items-center justify-center transition-all ${
                thirdsGrid
                  ? 'bg-accent-ai/20 text-accent-ai font-medium'
                  : 'text-text-disabled hover:text-text-primary hover:bg-bg-hover'
              }`}
              title="Toggle Rule of Thirds (3x3 Grid)"
            >
              <span className="material-symbols-outlined text-[14px]">grid_4x4</span>
            </button>
            <button
              type="button"
              onClick={() => setSocialZones((prev) => !prev)}
              className={`h-6 w-6 rounded text-[11px] flex items-center justify-center transition-all ${
                socialZones
                  ? 'bg-accent-ai/20 text-accent-ai font-medium'
                  : 'text-text-disabled hover:text-text-primary hover:bg-bg-hover'
              }`}
              title="Toggle Social UI Safe Zones (TikTok/Reels UI)"
            >
              <span className="material-symbols-outlined text-[14px]">stay_current_portrait</span>
            </button>
            <span className="h-3 w-px bg-hairline mx-0.5" />
            {/* S173 — Social Aspect Ratio Framing Mode Selector */}
            <div className="flex items-center rounded bg-bg-app border border-hairline/80 px-1 py-0.5">
              <button
                type="button"
                onClick={() => {
                  const aspects: (TargetAspectRatio | null)[] = [null, '9:16', '1:1', '4:5', '21:9'];
                  const currentIndex = aspects.indexOf(reframeAspect);
                  const nextAspect = aspects[(currentIndex + 1) % aspects.length];
                  setReframeAspect(nextAspect);
                  setReframeCropPan({ panX: 0, panY: 0 });
                }}
                className={`h-5 px-1.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all ${
                  reframeAspect
                    ? 'bg-accent-ai text-text-on-accent font-semibold shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title={
                  reframeAspect
                    ? `Active Social Framing: ${reframeAspect} (Click to cycle)`
                    : 'Aspect Framing Preview (Click to preview 9:16, 1:1, 4:5, 21:9 crops)'
                }
              >
                <span className="material-symbols-outlined text-[12px]">
                  {reframeAspect ? ASPECT_RATIO_PRESETS[reframeAspect].icon : 'aspect_ratio'}
                </span>
                <span>{reframeAspect ? reframeAspect : 'Native'}</span>
              </button>
              <button
                type="button"
                onClick={() => useModalStore.getState().openModal(MODAL_IDS.AUTO_REFRAME)}
                className="h-5 w-5 rounded text-[10px] flex items-center justify-center text-text-disabled hover:text-accent-ai hover:bg-bg-hover transition-colors"
                title="Open AI Auto-Reframe & Batch Social Stems Dialog"
              >
                <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
              </button>
            </div>
            <span className="h-3 w-px bg-hairline mx-0.5" />
            {/* S65 — MultiCam 4-Up Live Quad Switcher HUD button */}
            <button
              type="button"
              onClick={() => setMultiCamViewEnabled((prev) => !prev)}
              className={`h-6 w-6 rounded text-[11px] flex items-center justify-center transition-all ${
                multiCamViewEnabled
                  ? 'bg-accent-ai text-text-on-accent font-medium shadow-xs'
                  : 'text-text-disabled hover:text-text-primary hover:bg-bg-hover'
              }`}
              title="Toggle MultiCam 4-Up Live Switcher (Shift+0)"
            >
              <span className="material-symbols-outlined text-[14px]">grid_view</span>
            </button>
            {/* S160 — Live Stylus Vector Recording & Canvas Annotations */}
            <button
              type="button"
              onClick={toggleStylusMode}
              className={`h-6 w-6 rounded text-[11px] flex items-center justify-center transition-all ${
                isStylusActive
                  ? 'bg-accent-ai text-text-on-accent font-medium shadow-xs'
                  : 'text-text-disabled hover:text-text-primary hover:bg-bg-hover'
              }`}
              title="Toggle Live Stylus Recording & Vector Whiteboard Capture (P)"
            >
              <span className="material-symbols-outlined text-[14px]">gesture</span>
            </button>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all shadow-xs ${
              playing
                ? 'bg-accent-success/15 border border-accent-success/30 text-accent-success'
                : 'bg-bg-app border border-hairline text-text-secondary'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                playing ? 'bg-accent-success animate-pulse' : 'bg-text-disabled'
              }`}
            />
            {playing ? 'Playing' : 'Paused'}
          </span>
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative mx-auto w-full overflow-hidden rounded-[var(--radius-card)] bg-bg-canvas shadow-inner border border-hairline/60"
        style={{
          aspectRatio: sequenceAspect,
          maxHeight: 'calc(100vh - 350px)',
          filter: glActive ? undefined : frameFilter,
        }}
      >
        {underlayUrl && boundary ? (
          <img
            ref={underlayImgRef}
            src={underlayUrl}
            onLoad={bumpMedia}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full ${underlayMotion ? 'object-cover' : 'object-contain'}`}
            style={{
              transform: underlayMotion
                ? motionCssTransform(
                    motionAt(
                      underlayMotion,
                      boundary.previous.clip.durationFrames - 1,
                      boundary.previous.clip.durationFrames,
                    ),
                  )
                : undefined,
              filter: buildCssFilter(boundary.previous.clip.effects) || undefined,
            }}
          />
        ) : null}
        {underlayVideoUrl ? (
          <video
            ref={underlayVideoRef}
            src={underlayVideoUrl}
            onLoadedData={bumpMedia}
            onSeeked={bumpMedia}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        ) : null}
        {(stillUrl || videoUrl) && whiteboard ? (
          <div className="relative h-full w-full bg-media-board" style={boundaryLook?.incoming}>
            <WhiteboardLookDefs />
            {whiteboard.zones ? (
              whiteboard.zones.map((zone, index) => {
                const zoneClip = whiteboardZoneClipPath(
                  whiteboardZoneStateAt(whiteboard.progress, whiteboard.zones, index),
                );
                if (!zoneClip) return null;
                return stillUrl ? (
                  <img
                    key={index}
                    src={stillUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{
                      clipPath: zoneClip,
                      filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                    }}
                  />
                ) : (
                  <video
                    key={index}
                    src={videoUrl}
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{
                      clipPath: zoneClip,
                      filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                    }}
                  />
                );
              })
            ) : whiteboard.trace && traceArtifact && stillUrl ? (
              <TraceRevealCanvas
                artifact={traceArtifact}
                stillUrl={stillUrl}
                progress={whiteboard.progress}
                filter={whiteboardStillFilter(current?.clip.effects, whiteboard.look)}
              />
            ) : stillUrl ? (
              <img
                src={stillUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain"
                style={{
                  clipPath: whiteboardClipPath(whiteboard.progress, whiteboard.rows),
                  filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                }}
              />
            ) : (
              <video
                src={videoUrl}
                playsInline
                muted
                className="h-full w-full object-contain"
                style={{
                  clipPath: whiteboardClipPath(whiteboard.progress, whiteboard.rows),
                  filter: whiteboardStillFilter(current?.clip.effects, whiteboard.look),
                }}
              />
            )}
            {whiteboard.progress < 1 && whiteboard.hand !== 'none' && wbGlyphFront ? (
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute select-none text-3xl text-media-ink"
                style={{
                  left: `${wbGlyphFront.x * 100}%`,
                  top: `${wbGlyphFront.y * 100}%`,
                  transform:
                    whiteboard.hand === 'marker'
                      ? 'translate(-4px, -24px)'
                      : 'translate(-4px, -24px)',
                }}
              >
                {whiteboard.hand === 'marker' ? 'ink_marker' : 'stylus'}
              </span>
            ) : null}
          </div>
        ) : stillUrl ? (
          <img
            ref={stillImgRef}
            src={stillUrl}
            onLoad={bumpMedia}
            alt=""
            aria-hidden="true"
            className={`h-full w-full ${resolvedMotion ? 'object-cover' : 'object-contain'}`}
            style={{
              transform:
                [boundaryLook?.incoming.transform, motionTransform].filter(Boolean).join(' ') ||
                undefined,
              opacity: boundaryLook?.incoming.opacity,
              clipPath: boundaryLook?.incoming.clipPath,
              filter: buildCssFilter(current?.clip.effects) || undefined,
            }}
          />
        ) : null}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedData={bumpMedia}
            onSeeked={bumpMedia}
            playsInline
            className="h-full w-full object-contain"
            style={{
              ...boundaryLook?.incoming,
              filter: buildCssFilter(current?.clip.effects) || undefined,
            }}
          />
        ) : null}
        {boundaryLook?.veil ? (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: boundaryLook.veil.color,
              opacity: boundaryLook.veil.opacity,
            }}
          />
        ) : null}
        {glActive ? (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          />
        ) : null}

        {/* S65 — MultiCam Live 4-Up Quad Split Synchronized Playback Overlay */}
        {multiCamViewEnabled && currentMultiCamClip && (
          <div className="absolute inset-0 z-30 pointer-events-auto">
            <MultiCamGrid
              clip={currentMultiCamClip}
              playheadFrame={playheadFrame}
              fps={fps}
              playing={playing}
              playbackRate={playbackRate}
              onAngleSelect={handleMultiCamCut}
              onAngleCut={handleMultiCamCut}
            />
          </div>
        )}

        {/* S38 — Dynamic SVG Filters for Real-time Chroma Key Transparency */}
        <svg className="absolute h-0 w-0 pointer-events-none" aria-hidden="true">
          <defs>
            {[...(current ? [current] : []), ...overlayStack]
              .filter((p) => p.clip.effects?.chromaKey?.enabled)
              .map((p) => {
                const chromaData = buildSvgChromaFilterMatrix(p.clip.effects?.chromaKey);
                return (
                  <filter
                    id={`chromakey-${p.clip.id}`}
                    key={`chroma-${p.clip.id}`}
                    colorInterpolationFilters="sRGB"
                  >
                    <feColorMatrix type="matrix" values={chromaData.matrixValues} />
                  </filter>
                );
              })}
          </defs>
        </svg>

        {/* S39 — Dynamic SVG Feathered Masks */}
        <svg className="absolute h-0 w-0 pointer-events-none" aria-hidden="true">
          <defs>
            {[...(current ? [current] : []), ...overlayStack]
              .filter((p) => p.clip.effects?.mask?.enabled && p.clip.effects.mask.shape !== 'none')
              .map((p) => {
                const maskData = buildSvgMaskData(p.clip.effects?.mask, p.clip.id);
                if (!maskData) return null;
                return (
                  <mask
                    id={`clip-mask-${p.clip.id}`}
                    key={`mask-${p.clip.id}`}
                    maskContentUnits="objectBoundingBox"
                  >
                    {maskData.hasFeather && (
                      <filter id={`filter-feather-${p.clip.id}`}>
                        <feGaussianBlur stdDeviation={maskData.blurDeviation} />
                      </filter>
                    )}
                    {maskData.shapeElement.tag === 'ellipse' ? (
                      <ellipse
                        {...maskData.shapeElement.props}
                        filter={maskData.hasFeather ? `url(#filter-feather-${p.clip.id})` : undefined}
                      />
                    ) : (
                      <rect
                        {...maskData.shapeElement.props}
                        filter={maskData.hasFeather ? `url(#filter-feather-${p.clip.id})` : undefined}
                      />
                    )}
                  </mask>
                );
              })}
          </defs>
        </svg>

        {/* S62 — Adjustment Layer Overlay Containers (Shape Masks, Blend Modes, and Opacity) */}
        {activeAdjustmentLayers
          .filter(
            (l) =>
              Boolean(l.clip.effects?.mask?.enabled && l.clip.effects.mask.shape !== 'none') ||
              Boolean(l.clip.effects?.blendMode),
          )
          .map((layer) => {
            const styles = buildAdjustmentLayerCssStyles(layer.clip);
            return (
              <div
                key={'adj-overlay-' + layer.clip.id}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[14]"
                style={styles}
              />
            );
          })}

        {current?.clip.sourceKind === 'text' ? (
          <>
            <div className="absolute inset-0 bg-media-scrim-strong" />
            {renderText(
              current.clip.id,
              current.clip.effects?.text,
              current.startFrames,
              current.clip.durationFrames,
            )}
          </>
        ) : null}

        {/* S168 — Render active text clips from compound containers */}
        {activeCompoundFrame?.activeChildClips
          ?.filter((c) => c.sourceKind === 'text' && c.effects?.text)
          .map((textChild) =>
            renderText(
              textChild.id,
              textChild.effects?.text,
              current ? current.startFrames + (textChild.startFrames ?? 0) : 0,
              textChild.durationFrames,
            ),
          )}

        {/* S168 Compound Clip Active HUD Badge */}
        {current && isCompoundClip(current.clip) && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-cyan-500/40 text-[11px] font-medium text-cyan-300 pointer-events-none z-20 shadow-lg">
            <span className="material-symbols-outlined text-[13px]">auto_awesome_motion</span>
            <span className="font-semibold">{current.clip.label || 'Compound Clip'}</span>
            <span className="text-text-disabled">|</span>
            <span className="font-mono text-cyan-200">
              {activeCompoundFrame?.activeChildClips.length ?? 0} active
            </span>
          </div>
        )}

        {overlayStack.map((placed) =>
          placed.clip.sourceKind === 'text' ? (
            renderText(
              placed.clip.id,
              placed.clip.effects?.text,
              placed.startFrames,
              placed.clip.durationFrames,
            )
          ) : placed.clip.sourceKind === 'video' ? (
            <video
              key={placed.clip.id}
              ref={(element) => {
                overlayVideoRefs.current[placed.clip.id] = element;
              }}
              src={toMediaUrl(placed.clip.filePath)}
              playsInline
              className="absolute object-contain"
              style={overlayStyle(placed)}
            />
          ) : placed.clip.sourceKind === 'still' ? (
            <img
              key={placed.clip.id}
              src={toMediaUrl(placed.clip.filePath)}
              alt=""
              aria-hidden="true"
              className="absolute object-contain"
              style={overlayStyle(placed)}
            />
          ) : null,
        )}

        {reframeMotion && current ? (
          <div className="pointer-events-none absolute inset-0">
            <ReframeRect
              label="Start"
              viewpoint={reframeMotion.from ?? { x: 0.5, y: 0.5, scale: 1 }}
              className="border-accent-ai"
              onMove={(x, y) => {
                const clip = current.clip;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    motion: {
                      ...reframeMotion,
                      from: { scale: 1, ...reframeMotion.from, x, y },
                    },
                  },
                });
              }}
            />
            <ReframeRect
              label="End"
              viewpoint={reframeMotion.to ?? { x: 0.5, y: 0.5, scale: 1 }}
              className="border-accent-warning"
              onMove={(x, y) => {
                const clip = current.clip;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    motion: {
                      ...reframeMotion,
                      to: { scale: 1, ...reframeMotion.to, x, y },
                    },
                  },
                });
              }}
            />
          </div>
        ) : null}

        {/* CapCut-style Real-Time Video Effect Overlay */}
        {effectiveVfxPreset && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-[15] ${effectiveVfxPreset.cssClass}`}
            style={effectiveVfxStyle}
          />
        )}

        {/* Studio Safe Areas, Grids & Social Overlays */}
        <StudioOverlayGuides
          showSafeAreas={safeAreas}
          showThirdsGrid={thirdsGrid}
          showSocialZones={socialZones || reframeAspect !== null}
          targetAspect={reframeAspect}
        />

        {/* S173 — Interactive On-Canvas Social Crop Framing Box */}
        {reframeAspect && currentCropBox && document && (
          <InteractiveCropFramingBox
            sourceWidth={document.sequence.width}
            sourceHeight={document.sequence.height}
            targetAspect={reframeAspect}
            cropBox={currentCropBox}
            panX={reframeCropPan.panX}
            panY={reframeCropPan.panY}
            onPanChange={(panX, panY) => {
              setReframeCropPan({ panX, panY });
              if (current?.clip && (current.clip.sourceKind === 'video' || current.clip.sourceKind === 'still')) {
                const existingTransform = current.clip.effects?.transform ?? { scale: 1, x: 0, y: 0, rotationDeg: 0, opacity: 1 };
                patchClip(current.clip.id, {
                  effects: {
                    ...current.clip.effects,
                    transform: {
                      ...existingTransform,
                      x: Number((panX * 100).toFixed(2)),
                      y: Number((panY * 100).toFixed(2)),
                    },
                  },
                });
              }
            }}
            onResetPan={() => {
              setReframeCropPan({ panX: 0, panY: 0 });
              if (current?.clip && (current.clip.sourceKind === 'video' || current.clip.sourceKind === 'still')) {
                const existingTransform = current.clip.effects?.transform ?? { scale: 1, x: 0, y: 0, rotationDeg: 0, opacity: 1 };
                patchClip(current.clip.id, {
                  effects: {
                    ...current.clip.effects,
                    transform: {
                      ...existingTransform,
                      x: 0,
                      y: 0,
                    },
                  },
                });
              }
            }}
          />
        )}

        {/* S24 — Interactive On-Canvas Transform Gizmo */}
        {isTransformableSelected && selectedClip && (
          <TransformGizmo
            clip={selectedClip}
            containerDims={{
              width: boxRef.current?.clientWidth ?? 1920,
              height: boxRef.current?.clientHeight ?? 1080,
            }}
            onTransformChange={(transform, commit) => {
              if (commit) {
                setLiveOverlayTransform(null);
                patchClip(selectedClip.id, {
                  effects: {
                    ...selectedClip.effects,
                    transform,
                  },
                });
              } else {
                setLiveOverlayTransform({ clipId: selectedClip.id, transform });
              }
            }}
            onTextPositionChange={(pos, commit) => {
              if (commit && selectedClip.effects?.text) {
                setTextDragPct(null);
                patchClip(selectedClip.id, {
                  effects: {
                    ...selectedClip.effects,
                    text: {
                      ...selectedClip.effects.text,
                      positionPct: pos,
                    },
                  },
                });
              } else {
                setTextDragPct({
                  clipId: selectedClip.id,
                  x: pos.x,
                  y: pos.y,
                  snapped: { x: false, y: false },
                });
              }
            }}
          />
        )}

        {/* S160 — Real-Time Stylus Capture Canvas & HUD Overlay */}
        <StylusRecordingOverlay />
      </div>

      {/* Transport bar */}
      <div className="shrink-0 grid grid-cols-3 items-center gap-2 pt-1 select-none">
        <div className="justify-self-start">
          <TimelinePreviewTimecode fps={fps} durationFrames={durationFrames} />
        </div>

        <div className="flex items-center gap-1 justify-self-center">
          <IconButton
            icon="first_page"
            label={inPointFrame !== null ? `Go to In Point (${inPointFrame}f) (Home)` : 'Go to start (Home)'}
            size="sm"
            onClick={() => setPlayhead(inPointFrame ?? 0)}
          />
          <IconButton
            icon="skip_previous"
            label="Previous cut / marker (↑)"
            size="sm"
            onClick={goToPreviousCut}
          />
          <IconButton
            icon="chevron_left"
            label="Back one frame (←)"
            size="sm"
            onClick={() => setPlayhead(Math.max(0, currentPlayheadFrame() - 1))}
          />
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-ai text-text-on-accent hover:brightness-110 active:scale-95 transition-all shadow-sm"
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            <span className="material-symbols-outlined text-[19px]">
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <IconButton
            icon="chevron_right"
            label="Forward one frame (→)"
            size="sm"
            onClick={() => {
              setPlayhead(Math.min(durationFrames, currentPlayheadFrame() + 1));
            }}
          />
          <IconButton
            icon="skip_next"
            label="Next cut / marker (↓)"
            size="sm"
            onClick={goToNextCut}
          />
          <IconButton
            icon="last_page"
            label={outPointFrame !== null ? `Go to Out Point (${outPointFrame}f) (End)` : 'Go to end (End)'}
            size="sm"
            onClick={() => setPlayhead(outPointFrame ?? durationFrames)}
          />
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-hairline" />
          <IconButton
            icon="repeat"
            label={looping ? 'Loop playback active (Ctrl+L)' : 'Loop playback off (Ctrl+L)'}
            emphasis={looping}
            aria-pressed={looping}
            size="sm"
            onClick={toggleLooping}
          />
        </div>

        <div className="flex items-center gap-1.5 justify-self-end">
          {playbackRate !== 1 && playing ? (
            <span className="font-mono text-xs text-accent-ai font-medium">
              {playbackRate > 0 ? '▶' : '◀'} {Math.abs(playbackRate)}×
            </span>
          ) : null}

          {/* S176 — Live Hardware Playback & Dropped Frame Telemetry HUD */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-app border border-hairline font-mono text-[10px] text-text-secondary select-none"
            title={`Hardware Acceleration: ${glActive ? 'WebGL2 Pipeline' : 'Chromium Direct3D11 / NVDEC Bypass'} · Total Dropped Frames: ${droppedFrames}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                droppedFrames === 0
                  ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]'
              }`}
            />
            <span className="text-text-primary font-semibold">
              {playing ? `${liveFps.toFixed(1)} FPS` : `${fps} FPS`}
            </span>
            <span className="text-hairline">·</span>
            <span className="text-accent-ai">{glActive ? 'WebGL2 HW' : 'D3D11 HW'}</span>
            <span className="text-hairline">·</span>
            <span className={droppedFrames > 0 ? 'text-amber-400 font-semibold' : 'text-text-disabled'}>
              {droppedFrames} Drops
            </span>
          </div>

          <IconButton
            icon="query_stats"
            label={
              isScopesOpen
                ? 'Close Video Scopes (Shift+C)'
                : 'Open Broadcast Video Scopes (Waveform, Parade, Vectorscope) (Shift+C)'
            }
            emphasis={isScopesOpen}
            aria-pressed={isScopesOpen}
            size="sm"
            onClick={toggleScopes}
          />
          <InfoPopover label="About preview accuracy" align="left">
            {glActive
              ? `Every transition family previews in place — dissolves and their variants, dips, wipes, slides, pixelize and radial — blending in linear light the way the export does, and a video clip under a transition now holds its last frame. Grades preview in full, including gamma, sharpen and vignette. Auto-ducking previews live in full fidelity matching export sidechain compression. Still approximated: the blur dissolve’s softness is a nine-tap stand-in for the export’s kernel, and a whiteboard clip’s drawn hand renders in the export, while its board look previews as an SVG approximation of the edge chain.`
              : `Dissolves, dips, wipes and slides preview in place; pixelize and radial preview as plain dissolves. Auto-ducking previews live in full fidelity matching export sidechain compression. Gamma/sharpen/vignette appear in the export.`}
          </InfoPopover>
        </div>
      </div>

      <VideoScopesModal />

      {audioPlaced.map((placed) => (
        <audio
          key={placed.clip.id}
          ref={(element) => {
            audioRefs.current[placed.clip.id] = element;
          }}
          src={toMediaUrl(placed.clip.filePath)}
          preload="auto"
        />
      ))}
    </div>
  );
}

function ReframeRect({
  label,
  viewpoint,
  className,
  onMove,
}: {
  label: string;
  viewpoint: { x: number; y: number; scale: number };
  className: string;
  onMove: (x: number, y: number) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; fromX: number; fromY: number } | null>(null);
  const half = 1 / (2 * Math.max(1, viewpoint.scale));
  const clampCentre = (value: number): number => Math.min(1 - half, Math.max(half, value));
  return (
    <div
      role="slider"
      aria-label={`Reframe ${label} position`}
      aria-valuetext={`${(viewpoint.x * 100).toFixed(0)}%, ${(viewpoint.y * 100).toFixed(0)}%`}
      tabIndex={0}
      className={`absolute z-30 cursor-move border-2 ${className}`}
      style={{
        left: `${((viewpoint.x - half) * 100).toFixed(2)}%`,
        top: `${((viewpoint.y - half) * 100).toFixed(2)}%`,
        width: `${(2 * half * 100).toFixed(2)}%`,
        height: `${(2 * half * 100).toFixed(2)}%`,
      }}
      onPointerDown={(event) => {
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          fromX: viewpoint.x,
          fromY: viewpoint.y,
        };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        const dx = (event.clientX - drag.startX) / rect.width;
        const dy = (event.clientY - drag.startY) / rect.height;
        onMove(clampCentre(drag.fromX + dx), clampCentre(drag.fromY + dy));
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    />
  );
}
