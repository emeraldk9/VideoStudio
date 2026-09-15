import {
  formatDurationSeconds,
  toMediaUrl,
  type SequenceClip,
} from '@shared';

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
}

/**
 * Beta S145 — one clip on a lane.
 *
 * The consistency contract in the step file, made concrete:
 *
 * - **Six background tones** for the body: `bg-hover`, selected `bg-selected`.
 *   S165 amends the "no seventh" absolute by owner decision: the two
 *   *file-less* kinds (text, effect) wear their identity hue as a themed
 *   `color-mix` wash over the body tone (`KIND_TONE_WASH`) — themed tokens,
 *   not the raw `rgba` overlay S145 warned about, so it cannot invert into a
 *   grey smear in the light theme.
 * - **Accents mark state; media stays content-identified.** Sixty media clips
 *   tinted by type would be a rainbow — a still shows its image, a video its
 *   poster frame, audio its waveform. Only text/effect clips, which *have* no
 *   content to show, carry a kind hue.
 * - **No scale on drag.** Not merely stylistic: a clip that grows while
 *   dragging misreports its duration, the one thing this surface exists to
 *   communicate. Feedback is an opacity drop.
 * - Text over media uses the `--media-scrim` family, which is deliberately not
 *   themed — content is content in both themes, the same reasoning that fixed
 *   it for the lightbox.
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
}: TimelineClipProps) {
  const mediaUrl = clip.sourceKind === 'still' ? toMediaUrl(clip.filePath) : undefined;
  // Below this a label is unreadable and a duration chip overlaps the trim
  // handles; the clip stays draggable, it just stops trying to say anything.
  const compact = widthPx < 64;

  /**
   * S176 — the live half of the gesture: the clip follows the inherited
   * `--drag-dx` the panel writes per pointer event. A transform for a move
   * (compositor-only — no layout, no repaint of the content) and a
   * left/width calc for a trim; the px literals bake at drag start, only the
   * variable moves. Nothing here renders per pointermove.
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${clip.label || 'Clip'}, ${formatDurationSeconds(clip.durationFrames, fps)}`}
      aria-pressed={selected}
      className={[
        'group absolute top-0 overflow-hidden rounded-[var(--radius-button)] transition-colors duration-150',
        selected ? 'bg-bg-selected' : 'bg-bg-hover',
        // S176 — the S145 contract's drag feedback, finally on the clip
        // itself: an opacity drop, never a scale or a ghost.
        dragging ? 'opacity-60' : '',
      ].join(' ')}
      style={{
        left: leftPx,
        width: Math.max(2, widthPx),
        height: heightPx,
        backgroundImage: KIND_TONE_WASH[clip.sourceKind],
        ...liveStyle,
      }}
      onPointerDown={(event) => {
        // Right/middle presses belong to the context menu; selecting here
        // would collapse a multi-selection the menu is about to act on.
        if (event.button !== 0) return;
        // S160 — Ctrl/Cmd toggles membership and never begins a drag: a
        // toggle-out that also picked the clip up would fight itself.
        if (event.ctrlKey || event.metaKey) {
          onToggleSelect(clip.id);
          return;
        }
        onSelect(clip.id, event.shiftKey);
        onMoveStart(event, clip);
      }}
      onContextMenu={(event) => onContextMenu(event, clip)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) onToggleSelect(clip.id);
          else onSelect(clip.id, event.shiftKey);
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

      {/* The waveform is painted by the lane's shared canvas (Beta S151 H3),
          not per clip. The z-10 on the overlays below keeps text and state
          above that canvas's z-[1] — the clip itself creates no stacking
          context, so these participate directly in the lane's. */}
      {compact ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-1 p-1">
          <span
            className="flex min-w-0 items-center gap-0.5 truncate rounded-[4px] px-1 text-[10px] leading-4 text-media-text"
            style={{ backgroundColor: 'var(--media-scrim-soft)' }}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[12px] leading-4">
              {KIND_GLYPHS[clip.sourceKind]}
            </span>
            <span className="truncate">{clip.label || 'Clip'}</span>
          </span>
          <span
            className="shrink-0 rounded-[4px] px-1 font-mono text-[10px] leading-4 text-media-text"
            style={{ backgroundColor: 'var(--media-scrim-soft)' }}
          >
            {formatDurationSeconds(clip.durationFrames, fps)}
            {/*
              The provenance dot. A plain chip is the storyboard's duration; a
              dot means the user changed it. Not decoration — this is the
              per-field override marker that tells re-sync which values to
              leave alone, made visible.
            */}
            {clip.overrides.includes('durationFrames') ? (
              <span className="ml-1 inline-block h-1 w-1 rounded-full bg-accent-ai align-middle" />
            ) : null}
          </span>
        </div>
      )}

      {/* Selection: a 2px accent rule, no glow, no border, no ring. */}
      {selected ? <span className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-accent-ai" /> : null}

      {/* Trim handles. Video and audio only — a still (or a text clip, S154)
          has no source range to trim into, so offering the handle would imply
          a capability that does not exist; length changes via the duration
          chip instead. */}
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
