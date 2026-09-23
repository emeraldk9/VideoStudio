import { useEffect, useState } from 'react';

import {
  calculateFadeFrames,
  calculateTransitionDragFrames,
  clampGainDb,
  formatDurationSeconds,
  formatGainDb,
  framesToSeconds,
  gainDbToNormalized,
  getTransitionIcon,
  getColorLabelMeta,
  toMediaUrl,
  isAdjustmentLayerClip,
  isCompoundClip,
  isClipLinked,
  type SequenceClip,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { InlineKeyframeCurve } from './InlineKeyframeCurve';
import { InlineSpeedRampCurve } from './InlineSpeedRampCurve';

/**
 * S160 (owner item 2) — every kind announces itself in the label chip, the
 * way the effect clip always has. Content still carries most of the identity
 * (a still shows its image, audio its waveform); the glyph is for the cases
 * content cannot cover — a video clip with no poster yet, a text clip on a
 * short lane — and stays inside the "accents mark state, never fill" rule.
 */
const KIND_GLYPHS: Record<SequenceClip['sourceKind'], string> = {
  still: 'image',
  video: 'movie',
  audio: 'graphic_eq',
  text: 'title',
  effect: 'auto_fix_high',
  compound: 'auto_awesome_motion',
};

/**
 * S165 (owner direction, 2026-08-14) — the identity hue lives on the **clip
 * block**, by its kind: text clips violet, effect clips teal, matching the
 * CapCut convention where the chip carries the type colour. Media clips stay
 * neutral (their content is their identity) and the lane surfaces keep the
 * shared background. Painted as a `color-mix` wash *over* the `bg-hover`/
 * `bg-selected` body classes, so the selection tone still shifts beneath it
 * and the accent-ai selection rule stays the state marker.
 */
const KIND_TONE_WASH: Partial<Record<SequenceClip['sourceKind'], string>> = {
  text: 'linear-gradient(color-mix(in srgb, var(--track-text) 30%, transparent), color-mix(in srgb, var(--track-text) 30%, transparent))',
  effect:
    'linear-gradient(color-mix(in srgb, var(--track-overlay) 30%, transparent), color-mix(in srgb, var(--track-overlay) 30%, transparent))',
};

const ADJUSTMENT_LAYER_WASH =
  'linear-gradient(135deg, color-mix(in srgb, #8b5cf6 35%, transparent), color-mix(in srgb, #6366f1 22%, transparent))';

const COMPOUND_CLIP_WASH =
  'linear-gradient(135deg, color-mix(in srgb, #06b6d4 38%, transparent), color-mix(in srgb, #0284c7 28%, transparent))';

export interface TimelineClipProps {
  clip: SequenceClip;
  fps: number;
  widthPx: number;
  heightPx: number;
  leftPx: number;
  /** S176 — this clip follows the live `--drag-dx` offset (a move gesture). */
  dragging?: boolean;
  /** S176 — this clip's edge follows the live offset (a trim gesture). */
  trimming?: 'start' | 'end' | null;
  selected: boolean;
  onSelect: (clipId: string, additive: boolean) => void;
  /** S160 — Ctrl/Cmd+click: toggle membership without starting a drag. */
  onToggleSelect: (clipId: string) => void;
  onMoveStart: (event: React.PointerEvent, clip: SequenceClip) => void;
  onTrimStart: (event: React.PointerEvent, clip: SequenceClip, edge: 'start' | 'end') => void;
  /** S160 — right-click; the panel owns the menu. */
  onContextMenu: (event: React.MouseEvent, clip: SequenceClip) => void;
  /** S22 — Optional audio gain & fade adjustment handlers */
  onGainChange?: (clipId: string, gainDb: number) => void;
  onFadeChange?: (clipId: string, edge: 'in' | 'out', frames: number) => void;
}

/**
 * Beta S145 — one clip on a lane.
 * S22 — Interactive Audio Gain Rubberband and Fade In/Out Drag Handles.
 */
export function TimelineClip({
  clip,
  fps,
  widthPx,
  heightPx,
  leftPx,
  dragging = false,
  trimming = null,
  selected,
  onSelect,
  onToggleSelect,
  onMoveStart,
  onTrimStart,
  onContextMenu,
  onGainChange,
  onFadeChange,
}: TimelineClipProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const stepIntoCompoundClip = useSequenceStore((state) => state.stepIntoCompoundClip);

  // Live dragging state for gain rubberband
  const [liveGainDb, setLiveGainDb] = useState<number | null>(null);
  const [gainDragging, setGainDragging] = useState<boolean>(false);
  const [gainHovered, setGainHovered] = useState<boolean>(false);

  // Live dragging state for fade handles
  const [liveFadeIn, setLiveFadeIn] = useState<number | null>(null);
  const [liveFadeOut, setLiveFadeOut] = useState<number | null>(null);
  const [fadeDragging, setFadeDragging] = useState<'in' | 'out' | null>(null);
  const [liveTransitionFrames, setLiveTransitionFrames] = useState<number | null>(null);

  // Milestone S67: Track automation lane curve view
  const [showAutomation, setShowAutomation] = useState<boolean>(false);

  useEffect(() => {
    const handleToggle = (e: CustomEvent<{ clipId: string }>) => {
      if (e.detail?.clipId === clip.id) {
        setShowAutomation((prev) => !prev);
      }
    };
    window.addEventListener('toggle-clip-automation' as any, handleToggle);
    return () => window.removeEventListener('toggle-clip-automation' as any, handleToggle);
  }, [clip.id]);

  // Milestone S72: In-clip speed ramp Bézier curve view
  const [showSpeedRamp, setShowSpeedRamp] = useState<boolean>(false);

  useEffect(() => {
    const handleToggleSpeedRamp = (e: CustomEvent<{ clipId: string }>) => {
      if (e.detail?.clipId === clip.id) {
        setShowSpeedRamp((prev) => !prev);
      }
    };
    window.addEventListener('toggle-clip-speed-ramp' as any, handleToggleSpeedRamp);
    return () => window.removeEventListener('toggle-clip-speed-ramp' as any, handleToggleSpeedRamp);
  }, [clip.id]);

  const effectiveGainDb = liveGainDb ?? (clip.gainDb ?? 0);
  const effectiveFadeIn = liveFadeIn ?? (clip.fadeInFrames ?? 0);
  const effectiveFadeOut = liveFadeOut ?? (clip.fadeOutFrames ?? 0);

  const mediaUrl = clip.sourceKind === 'still' ? toMediaUrl(clip.filePath) : undefined;
  const compact = widthPx < 64;
  const pxPerFrame = widthPx / Math.max(1, clip.durationFrames);
  const isAudioCapable = clip.sourceKind === 'audio' || clip.sourceKind === 'video';
  const showAudioControls = isAudioCapable && !compact && heightPx >= 36;

  /**
   * S176 — the live half of the gesture: the clip follows the inherited
   * `--drag-dx` the panel writes per pointer event.
   */
  const liveStyle: React.CSSProperties | null = dragging
    ? { transform: 'translateX(var(--drag-dx, 0px))', willChange: 'transform' }
    : trimming === 'end'
      ? { width: `calc(${Math.max(2, widthPx)}px + var(--drag-dx, 0px))` }
      : trimming === 'start'
        ? {
            left: `calc(${leftPx}px + var(--drag-dx, 0px))`,
            width: `calc(${Math.max(2, widthPx)}px - var(--drag-dx, 0px))`,
          }
        : null;

  // Handle Gain Rubberband Pointer Down
  const handleGainPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    const initialGain = clip.gainDb ?? 0;
    setGainDragging(true);
    setLiveGainDb(initialGain);

    const targetEl = event.currentTarget as HTMLElement;
    targetEl.setPointerCapture(event.pointerId);

    const onPointerMove = (e: PointerEvent) => {
      const deltaY = startY - e.clientY;
      const newGain = clampGainDb(initialGain + deltaY * 0.4);
      setLiveGainDb(newGain);
    };

    const onPointerUp = (e: PointerEvent) => {
      targetEl.releasePointerCapture(e.pointerId);
      targetEl.removeEventListener('pointermove', onPointerMove);
      targetEl.removeEventListener('pointerup', onPointerUp);
      targetEl.removeEventListener('pointercancel', onPointerUp);
      setGainDragging(false);
      setLiveGainDb((current) => {
        const finalGain = current ?? initialGain;
        if (onGainChange) {
          onGainChange(clip.id, finalGain);
        } else {
          patchClip(clip.id, { gainDb: finalGain });
        }
        return null;
      });
    };

    targetEl.addEventListener('pointermove', onPointerMove);
    targetEl.addEventListener('pointerup', onPointerUp);
    targetEl.addEventListener('pointercancel', onPointerUp);
  };

  const handleGainDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (onGainChange) {
      onGainChange(clip.id, 0);
    } else {
      patchClip(clip.id, { gainDb: 0 });
    }
  };

  // Handle Fade In Handle Pointer Down
  const handleFadeInPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const initialFrames = clip.fadeInFrames ?? 0;
    const maxFrames = Math.floor(clip.durationFrames / 2);
    setFadeDragging('in');
    setLiveFadeIn(initialFrames);

    const targetEl = event.currentTarget as HTMLElement;
    targetEl.setPointerCapture(event.pointerId);

    const onPointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const targetFrames = calculateFadeFrames(initialFrames, deltaX, pxPerFrame, maxFrames, 1);
      setLiveFadeIn(targetFrames);
    };

    const onPointerUp = (e: PointerEvent) => {
      targetEl.releasePointerCapture(e.pointerId);
      targetEl.removeEventListener('pointermove', onPointerMove);
      targetEl.removeEventListener('pointerup', onPointerUp);
      targetEl.removeEventListener('pointercancel', onPointerUp);
      setFadeDragging(null);
      setLiveFadeIn((current) => {
        const finalFrames = current ?? initialFrames;
        if (onFadeChange) {
          onFadeChange(clip.id, 'in', finalFrames);
        } else {
          patchClip(clip.id, { fadeInFrames: finalFrames });
        }
        return null;
      });
    };

    targetEl.addEventListener('pointermove', onPointerMove);
    targetEl.addEventListener('pointerup', onPointerUp);
    targetEl.addEventListener('pointercancel', onPointerUp);
  };

  // Handle Fade Out Handle Pointer Down
  const handleFadeOutPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const initialFrames = clip.fadeOutFrames ?? 0;
    const maxFrames = Math.floor(clip.durationFrames / 2);
    setFadeDragging('out');
    setLiveFadeOut(initialFrames);

    const targetEl = event.currentTarget as HTMLElement;
    targetEl.setPointerCapture(event.pointerId);

    const onPointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const targetFrames = calculateFadeFrames(initialFrames, deltaX, pxPerFrame, maxFrames, -1);
      setLiveFadeOut(targetFrames);
    };

    const onPointerUp = (e: PointerEvent) => {
      targetEl.releasePointerCapture(e.pointerId);
      targetEl.removeEventListener('pointermove', onPointerMove);
      targetEl.removeEventListener('pointerup', onPointerUp);
      targetEl.removeEventListener('pointercancel', onPointerUp);
      setFadeDragging(null);
      setLiveFadeOut((current) => {
        const finalFrames = current ?? initialFrames;
        if (onFadeChange) {
          onFadeChange(clip.id, 'out', finalFrames);
        } else {
          patchClip(clip.id, { fadeOutFrames: finalFrames });
        }
        return null;
      });
    };

    targetEl.addEventListener('pointermove', onPointerMove);
    targetEl.addEventListener('pointerup', onPointerUp);
    targetEl.addEventListener('pointercancel', onPointerUp);
  };

  // S23 Transition Drag Resizing
  const handleTransitionPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const initialFrames = clip.transitionFrames || 12;

    const targetEl = event.currentTarget as HTMLElement;
    targetEl.setPointerCapture(event.pointerId);

    const onPointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const targetFrames = calculateTransitionDragFrames(initialFrames, deltaX, pxPerFrame, clip.durationFrames);
      setLiveTransitionFrames(targetFrames);
    };

    const onPointerUp = (e: PointerEvent) => {
      targetEl.releasePointerCapture(e.pointerId);
      targetEl.removeEventListener('pointermove', onPointerMove);
      targetEl.removeEventListener('pointerup', onPointerUp);
      targetEl.removeEventListener('pointercancel', onPointerUp);
      setLiveTransitionFrames((current) => {
        const finalFrames = current ?? initialFrames;
        patchClip(clip.id, { transitionFrames: finalFrames });
        return null;
      });
    };

    targetEl.addEventListener('pointermove', onPointerMove);
    targetEl.addEventListener('pointerup', onPointerUp);
    targetEl.addEventListener('pointercancel', onPointerUp);
  };

  const handleTransitionDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    patchClip(clip.id, { transitionIn: 'cut', transitionFrames: 0 });
  };

  const colorMeta = getColorLabelMeta(clip.colorLabel);
  const hasCustomColor = clip.colorLabel && clip.colorLabel !== 'default';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${clip.label || 'Clip'}, ${formatDurationSeconds(clip.durationFrames, fps)}`}
      aria-pressed={selected}
      className={[
        'group absolute top-0 overflow-hidden rounded-[var(--radius-button)] transition-colors duration-150',
        selected ? 'bg-bg-selected' : 'bg-bg-hover',
        dragging ? 'opacity-60' : '',
      ].join(' ')}
      style={{
        left: leftPx,
        width: Math.max(2, widthPx),
        height: heightPx,
        backgroundImage: hasCustomColor
          ? colorMeta.washGradient
          : isAdjustmentLayerClip(clip) && (!clip.effects?.videoEffect || (clip.label && clip.label.toLowerCase().includes('adjustment')))
            ? ADJUSTMENT_LAYER_WASH
            : isCompoundClip(clip)
              ? COMPOUND_CLIP_WASH
              : KIND_TONE_WASH[clip.sourceKind],
        ...liveStyle,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (event.ctrlKey || event.metaKey) {
          onToggleSelect(clip.id);
          return;
        }
        onSelect(clip.id, event.shiftKey);
        onMoveStart(event, clip);
      }}
      onContextMenu={(event) => onContextMenu(event, clip)}
      onKeyDown={(event) => {
        if (event.altKey && (event.key === 'k' || event.key === 'K')) {
          event.preventDefault();
          event.stopPropagation();
          setShowAutomation((prev) => !prev);
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) onToggleSelect(clip.id);
          else onSelect(clip.id, event.shiftKey);
        }
      }}
      onDoubleClick={(event) => {
        if (isCompoundClip(clip)) {
          event.stopPropagation();
          void stepIntoCompoundClip(clip);
        }
      }}
    >
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
          draggable={false}
        />
      ) : null}

      {/* S25 Studio Clip Color Label Tag Bar */}
      {hasCustomColor && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-[3.5px] z-[5] ${colorMeta.stripeClass}`}
        />
      )}

      {/* S22 Audio Fade Slope SVG Overlay */}
      {showAudioControls && (effectiveFadeIn > 0 || effectiveFadeOut > 0) ? (
        <svg
          className="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-hidden"
          preserveAspectRatio="none"
        >
          {effectiveFadeIn > 0 ? (
            <g>
              <polygon
                points={`0,0 0,${heightPx} ${Math.min(widthPx, effectiveFadeIn * pxPerFrame)},0`}
                fill="rgba(0, 0, 0, 0.35)"
              />
              <line
                x1={0}
                y1={heightPx}
                x2={Math.min(widthPx, effectiveFadeIn * pxPerFrame)}
                y2={0}
                stroke="var(--color-accent-ai, #6366f1)"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                opacity={0.8}
              />
            </g>
          ) : null}
          {effectiveFadeOut > 0 ? (
            <g>
              <polygon
                points={`${Math.max(0, widthPx - effectiveFadeOut * pxPerFrame)},0 ${widthPx},${heightPx} ${widthPx},0`}
                fill="rgba(0, 0, 0, 0.35)"
              />
              <line
                x1={Math.max(0, widthPx - effectiveFadeOut * pxPerFrame)}
                y1={0}
                x2={widthPx}
                y2={heightPx}
                stroke="var(--color-accent-ai, #6366f1)"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                opacity={0.8}
              />
            </g>
          ) : null}
        </svg>
      ) : null}

      {/* S22 Audio Gain Rubberband (Volume Line) */}
      {!showAutomation && showAudioControls ? (
        <div
          role="slider"
          aria-label="Audio clip gain rubberband"
          aria-valuenow={effectiveGainDb}
          className="group/gain absolute inset-x-0 z-20 cursor-ns-resize"
          style={{
            bottom: Math.max(6, Math.min(heightPx - 8, heightPx * gainDbToNormalized(effectiveGainDb) - 5)),
            height: 10,
          }}
          onPointerDown={handleGainPointerDown}
          onDoubleClick={handleGainDoubleClick}
          onPointerEnter={() => setGainHovered(true)}
          onPointerLeave={() => setGainHovered(false)}
          title={`Volume: ${formatGainDb(effectiveGainDb)} (drag vertically, double click to reset 0 dB)`}
        >
          {/* Visual line */}
          <div
            className={[
              'absolute inset-x-0 top-1/2 -translate-y-1/2 transition-colors pointer-events-none',
              gainDragging || gainHovered
                ? 'h-[2px] bg-accent-ai shadow-sm'
                : effectiveGainDb === 0
                  ? 'h-[1px] bg-white/40'
                  : 'h-[1.5px] bg-amber-400/80',
            ].join(' ')}
          />

          {/* dB badge on hover or drag */}
          {gainDragging || gainHovered ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-bg-panel/95 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent-ai border border-accent-ai/40 shadow-md whitespace-nowrap">
              {formatGainDb(effectiveGainDb)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* S22 Fade In Handle */}
      {!showAutomation && showAudioControls ? (
        <div
          role="slider"
          aria-label="Fade in handle"
          aria-valuenow={effectiveFadeIn}
          className={[
            'absolute top-0 z-20 flex h-4 w-3.5 items-center justify-center cursor-ew-resize select-none transition-transform',
            fadeDragging === 'in' ? 'scale-125' : 'group-hover:opacity-100 opacity-60 hover:opacity-100',
          ].join(' ')}
          style={{
            left: Math.max(0, Math.min(widthPx - 14, effectiveFadeIn * pxPerFrame - 7)),
          }}
          onPointerDown={handleFadeInPointerDown}
          title={`Fade in: ${framesToSeconds(effectiveFadeIn, fps).toFixed(2)}s (${effectiveFadeIn}f)`}
        >
          <div className="h-3 w-2.5 rounded-[2px] bg-white/90 shadow-sm border border-black/50 hover:bg-accent-ai hover:border-accent-ai" />
        </div>
      ) : null}

      {/* S22 Fade Out Handle */}
      {!showAutomation && showAudioControls ? (
        <div
          role="slider"
          aria-label="Fade out handle"
          aria-valuenow={effectiveFadeOut}
          className={[
            'absolute top-0 z-20 flex h-4 w-3.5 items-center justify-center cursor-ew-resize select-none transition-transform',
            fadeDragging === 'out' ? 'scale-125' : 'group-hover:opacity-100 opacity-60 hover:opacity-100',
          ].join(' ')}
          style={{
            left: Math.max(0, Math.min(widthPx - 14, widthPx - effectiveFadeOut * pxPerFrame - 7)),
          }}
          onPointerDown={handleFadeOutPointerDown}
          title={`Fade out: ${framesToSeconds(effectiveFadeOut, fps).toFixed(2)}s (${effectiveFadeOut}f)`}
        >
          <div className="h-3 w-2.5 rounded-[2px] bg-white/90 shadow-sm border border-black/50 hover:bg-accent-ai hover:border-accent-ai" />
        </div>
      ) : null}

      {/* S67 Inline Automation Lane & Velocity Tangent Editor */}
      {showAutomation ? (
        <InlineKeyframeCurve
          clip={clip}
          fps={fps}
          widthPx={widthPx}
          heightPx={heightPx}
          onClose={() => setShowAutomation(false)}
        />
      ) : null}

      {/* S72 Inline Speed Ramp Bézier Gizmo */}
      {showSpeedRamp ? (
        <InlineSpeedRampCurve
          clip={clip}
          fps={fps}
          widthPx={widthPx}
          heightPx={heightPx}
          onClose={() => setShowSpeedRamp(false)}
        />
      ) : null}

      {/* Label and duration */}
      {compact ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-1 p-1">
          <span
            className="flex min-w-0 items-center gap-0.5 truncate rounded-[4px] px-1 text-[10px] leading-4 text-media-text"
            style={{ backgroundColor: 'var(--media-scrim-soft)' }}
          >
            {isCompoundClip(clip) ? (
              <span aria-hidden="true" className="material-symbols-outlined text-[12px] leading-4 text-cyan-300">
                auto_awesome_motion
              </span>
            ) : (
              <span aria-hidden="true" className="material-symbols-outlined text-[12px] leading-4">
                {clip.sourceKind === 'effect'
                  ? clip.effects?.videoEffect
                    ? 'auto_fix_high'
                    : 'tune'
                  : KIND_GLYPHS[clip.sourceKind]}
              </span>
            )}
            {hasCustomColor && (
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${colorMeta.dotClass}`}
                title={`Color: ${colorMeta.name}`}
              />
            )}
            {isClipLinked(clip) && (
              <span
                aria-label="Linked Clip"
                title={`Linked to clip ${clip.linkedClipId}${clip.syncOffsetFrames !== undefined ? ` (Sync offset: ${clip.syncOffsetFrames}f)` : ''}`}
                className="material-symbols-outlined text-[12px] leading-4 text-emerald-400 shrink-0 select-none"
              >
                link
              </span>
            )}
            <span className="truncate">{clip.label || (isCompoundClip(clip) ? 'Compound Clip' : 'Clip')}</span>
            {isCompoundClip(clip) && clip.effects?.compound && (
              <span className="ml-1 rounded bg-black/40 px-1 font-mono text-[9px] text-cyan-300">
                {clip.effects.compound.childClipCount} clips
              </span>
            )}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {/* S67 Automation Curve Toggle Button */}
            <button
              type="button"
              className={[
                'pointer-events-auto flex items-center justify-center rounded px-1 py-0.5 text-[10px] leading-3 transition-colors',
                showAutomation
                  ? 'bg-accent-ai text-black font-bold shadow-xs'
                  : clip.keyframes && clip.keyframes.length > 0
                    ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/50'
                    : 'text-media-text/70 hover:text-media-text hover:bg-white/20',
              ].join(' ')}
              onClick={(e) => {
                e.stopPropagation();
                setShowAutomation((prev) => !prev);
              }}
              title={`Toggle Automation Curve (Alt+K)${clip.keyframes?.length ? ` — ${clip.keyframes.length} keyframes` : ''}`}
            >
              <span className="material-symbols-outlined text-[12px] leading-none">
                timeline
              </span>
            </button>

            {/* S72 Speed Ramp Curve Toggle Button */}
            {(clip.sourceKind === 'video' || clip.sourceKind === 'audio') && (
              <button
                type="button"
                className={[
                  'pointer-events-auto flex items-center justify-center rounded px-1 py-0.5 text-[10px] leading-3 transition-colors',
                  showSpeedRamp
                    ? 'bg-amber-400 text-black font-bold shadow-xs'
                    : clip.effects?.speedRamp?.enabled
                      ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/50'
                      : 'text-media-text/70 hover:text-media-text hover:bg-white/20',
                ].join(' ')}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedRamp((prev) => !prev);
                }}
                title={`Toggle Speed Ramp Curve (Alt+R)${clip.effects?.speedRamp?.enabled ? ' — Active Speed Ramp' : ''}`}
              >
                <span className="material-symbols-outlined text-[12px] leading-none">
                  speed
                </span>
              </button>
            )}

            <span
              className="shrink-0 rounded-[4px] px-1 font-mono text-[10px] leading-4 text-media-text"
              style={{ backgroundColor: 'var(--media-scrim-soft)' }}
            >
              {formatDurationSeconds(clip.durationFrames, fps)}
              {clip.overrides.includes('durationFrames') ? (
                <span className="ml-1 inline-block h-1 w-1 rounded-full bg-accent-ai align-middle" />
              ) : null}
            </span>
          </div>
        </div>
      )}

      {/* Selection: a 2px accent rule */}
      {selected ? <span className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-accent-ai" /> : null}

      {/* S23 Timeline Transition Block & Interactive Trim Handle */}
      {clip.transitionIn && clip.transitionIn !== 'cut' && !compact ? (
        <div
          className="group/trans absolute top-0 bottom-0 left-0 z-20 flex items-start overflow-hidden select-none"
          style={{
            width: Math.max(18, Math.min(widthPx, (liveTransitionFrames ?? clip.transitionFrames) * pxPerFrame)),
            background:
              'repeating-linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.22) 6px, rgba(99,102,241,0.08) 6px, rgba(99,102,241,0.08) 12px)',
          }}
          title={`Transition: ${clip.transitionIn} (${liveTransitionFrames ?? clip.transitionFrames}f) — Drag right edge to resize, double-click to remove`}
          onDoubleClick={handleTransitionDoubleClick}
        >
          {/* Transition Label & Icon Chip */}
          <div className="flex items-center gap-1 rounded-[3px] bg-black/80 px-1.5 py-0.5 m-1 font-mono text-[9px] text-accent-ai border border-accent-ai/50 shadow-xs pointer-events-none truncate">
            <span className="material-symbols-outlined text-[11px]">
              {getTransitionIcon(clip.transitionIn)}
            </span>
            <span className="font-semibold">
              {liveTransitionFrames ?? clip.transitionFrames}f
            </span>
          </div>

          {/* Right-edge Interactive Resize Handle */}
          <div
            role="slider"
            aria-label="Transition duration handle"
            aria-valuenow={liveTransitionFrames ?? clip.transitionFrames}
            className="absolute top-0 bottom-0 right-0 w-2.5 cursor-ew-resize flex items-center justify-center opacity-70 group-hover/trans:opacity-100 hover:opacity-100 bg-accent-ai/30 border-r-2 border-accent-ai transition-opacity"
            onPointerDown={handleTransitionPointerDown}
            title="Drag to adjust transition duration"
          >
            <div className="h-3 w-0.5 rounded-full bg-white/90 shadow-xs" />
          </div>
        </div>
      ) : null}

      {/* Trim handles */}
      {clip.sourceKind === 'still' || clip.sourceKind === 'text' || compact ? null : (
        <>
          <span
            role="presentation"
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity duration-100 group-hover:opacity-100"
            style={{ backgroundColor: 'var(--media-scrim)' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onTrimStart(event, clip, 'start');
            }}
          />
          <span
            role="presentation"
            className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity duration-100 group-hover:opacity-100"
            style={{ backgroundColor: 'var(--media-scrim)' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onTrimStart(event, clip, 'end');
            }}
          />
        </>
      )}
    </div>
  );
}
