import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  TIMELINE_DRAG_MIME,
  isOverlayTrack,
  isTextTrack,
  layoutTrack,
  type SequenceClip,
  type SequenceTrack,
  type TimelineDragItem,
  type TrackRole,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useDismissOnOutside } from '../../../shared/ui/DropdownPanel';
import { IconButton } from '../../../shared/ui/IconButton';

import { FilmstripCanvas } from './FilmstripCanvas';
import { RenameInput } from './RenameInput';
import { TimelineClip } from './TimelineClip';
import { WaveformCanvas } from './WaveformCanvas';

/**
 * Width of the track-header gutter (the old lane-label column, S154-widened to
 * hold the name and the mute/solo/lock toggles).
 *
 * Exported because the ruler, the playhead and the fit-to-window calculation
 * all have to start where the troughs start. It was three separate literals
 * before Beta S151, which is exactly the kind of agreement that silently
 * breaks when one of them is adjusted.
 */
export const LANE_LABEL_WIDTH_PX = 152;

export interface TimelineTrackRowProps {
  track: SequenceTrack;
  clips: SequenceClip[];
  fps: number;
  pixelsPerSecond: number;
  widthPx: number;
  selectedClipIds: string[];
  /** True when some *other* track is soloed and this one is not — the row dims. */
  dimmed: boolean;
  /** S166 — this row is the one being header-dragged; it lifts (opacity drop). */
  lifted: boolean;
  /** S176 — clips the live drag offset moves, and which gesture is moving them. */
  liveDragClipIds: ReadonlySet<string> | null;
  liveDragKind: 'move' | 'trim-start' | 'trim-end' | 'scrub' | null;
  /** S166 — ⋮ menu reorder-by-one; `null` hides the item (stack edge, or the spine). */
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  /** S157 — a clip mid-drag would land here; the trough lights up. S200 — or a pool drag would. */
  dropTarget: boolean;
  /**
   * S200 — the pool drag currently hovering *this* trough, for the insertion
   * ghost; `null` on every other lane. Changes only when the target lane
   * changes — the ghost's position rides `--drop-x`, written imperatively.
   */
  dropItems: readonly TimelineDragItem[] | null;
  onSelect: (clipId: string, additive: boolean) => void;
  /** S160 — Ctrl/Cmd+click toggle, passed through to the clip. */
  onToggleSelect: (clipId: string) => void;
  onMoveStart: (event: React.PointerEvent, clip: SequenceClip) => void;
  onTrimStart: (event: React.PointerEvent, clip: SequenceClip, edge: 'start' | 'end') => void;
  /** S160 — clip right-click; the panel owns the menu. */
  onClipContextMenu: (event: React.MouseEvent, clip: SequenceClip) => void;
  /** S17 — Empty space / gap right-click on the trough; the panel owns the menu. */
  onTroughContextMenu?: (event: React.MouseEvent, track: SequenceTrack, frame: number) => void;
  /** S17 — Currently active gap highlight when gap context menu is open. */
  activeGap?: { trackId: string; startFrames: number; endFrames: number; durationFrames: number } | null;
  /** S22 — Audio gain & fade adjustment handlers */
  onGainChange?: (clipId: string, gainDb: number) => void;
  onFadeChange?: (clipId: string, edge: 'in' | 'out', frames: number) => void;
  /**
   * S200 — a pool drag is over the trough at `frame` (raw, from the pointer).
   * The panel resolves it (snap, legality) and answers the frame the drop
   * would use, or `null` when this drag may not land here.
   */
  onDropHover: (track: SequenceTrack, frame: number, altKey: boolean) => number | null;
  /** S200 — the drop, at the panel-resolved frame. */
  onDropFile: (track: SequenceTrack, payload: string, frame: number) => void;
  /** Direct OS file drop onto this track (Premiere/DaVinci standard). */
  onDropExternalFiles?: (track: SequenceTrack, filePaths: string[], frame: number) => void;
  /** S157 — header drag, the z-order gesture. The panel owns the geometry. */
  onReorderStart: (track: SequenceTrack, clientY: number) => void;
  onReorderMove: (clientY: number) => void;
  onReorderEnd: () => void;
  /** S157 — marquee select, started from a press on *empty* trough space. */
  onMarqueeStart: (event: React.PointerEvent, track: SequenceTrack) => void;
}

/**
 * Beta S145 — one track's trough and the clips on it. Beta S154 — the track
 * is a document row the user owns: rename, mute, solo (monitoring-only),
 * lock, delete. Beta S157 (owner item 5) — the header is **icon-only, one
 * row**: the S154 header stacked a name line over a button row and clipped at
 * the 36px audio height. The name now lives in the kind glyph's tooltip, and
 * rename is still here — double-click (or F2 on) the glyph swaps the whole
 * row for an input, the `SequenceTabs` pattern.
 *
 * Positions come from `layoutTrack`, never from stored coordinates: a
 * magnetic track derives each start from the clips before it, so this
 * component cannot render a gap even if one were somehow expressed. Free
 * tracks lay out from their explicit offsets.
 *
 * Design-system note: S157's "tracks get no identity colour" (§6 trap 8)
 * survives S165 almost intact — lane surfaces (header and trough) keep the
 * neutral `bg-workspace` everywhere (owner direction, 2026-08-14: "the track
 * line still uses the same background as the rest"). The identity hue lives
 * on the **clip blocks** (text violet, effect teal — `TimelineClip`) and on
 * the header's kind glyph; a locked track is still a glyph and reduced
 * opacity — never a hue.
 */

/** The header's kind glyph — the only always-visible identity the track has.
    An audio track's glyph is its **role** (S157): mic, note, or plain wave.
    S160 (owner item 2) — video splits by *position in the composite*: the
    spine is the cut (`movie`). S165 — the lanes above it split by *role*:
    a text lane wears `title` (the "T"), an effects-overlay lane wears
    `auto_fix_high` (the wand-with-stars), and a plain video lane — PiP
    media, fix 2 — wears `videocam`, distinct from both the wand and the
    spine's `movie`. */
function kindGlyph(track: SequenceTrack, spineTrackId: string | null): string {
  if (track.kind === 'video') {
    if (track.id === spineTrackId) return 'movie';
    if (isTextTrack(track)) return 'title';
    return isOverlayTrack(track) ? 'auto_fix_high' : 'videocam';
  }
  if (track.role === 'narration') return 'mic';
  if (track.role === 'music') return 'music_note';
  return 'graphic_eq';
}

/**
 * S200 — where a magnetic lane's insertion ghost sits for a pointer frame:
 * the leading edge of the slot the frame resolves to under the centre rule
 * (`placeSourcesAt`'s), so the ghost shows exactly where the block will land.
 */
function slotFrameFor(placed: readonly { startFrames: number; endFrames: number; clip: SequenceClip }[], frame: number): number {
  const index = placed.filter((item) => item.startFrames + item.clip.durationFrames / 2 < frame).length;
  if (index < placed.length) return placed[index].startFrames;
  return placed.length > 0 ? placed[placed.length - 1].endFrames : 0;
}

/** S165 — which identity hue a lane carries: text, overlay, or none
    (spine, plain video lanes and audio stay neutral). */
export type LaneTone = 'text' | 'overlay' | null;

export function laneToneOf(track: SequenceTrack, spineTrackId: string | null): LaneTone {
  if (track.kind !== 'video' || track.id === spineTrackId) return null;
  if (isTextTrack(track)) return 'text';
  return isOverlayTrack(track) ? 'overlay' : null;
}

const TONE_GLYPH_CLASS: Record<Exclude<LaneTone, null>, string> = {
  text: 'text-track-text',
  overlay: 'text-track-overlay',
};

const ROLE_LABELS: { role: TrackRole | null; label: string }[] = [
  { role: 'narration', label: 'Narration — the duck key' },
  { role: 'music', label: 'Music — ducks under narration' },
  { role: null, label: 'No role' },
];
export function TimelineTrackRow({
  track,
  clips,
  fps,
  pixelsPerSecond,
  widthPx,
  selectedClipIds,
  dimmed,
  lifted,
  liveDragClipIds,
  liveDragKind,
  onMoveUp,
  onMoveDown,
  onSelect,
  dropTarget,
  dropItems,
  onToggleSelect,
  onMoveStart,
  onTrimStart,
  onClipContextMenu,
  onTroughContextMenu,
  activeGap,
  onGainChange,
  onFadeChange,
  onDropHover,
  onDropFile,
  onDropExternalFiles,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onMarqueeStart,
}: TimelineTrackRowProps) {
  const patchTrack = useSequenceStore((state) => state.patchTrack);
  const removeTrack = useSequenceStore((state) => state.removeTrack);
  const toggleSolo = useSequenceStore((state) => state.toggleSolo);
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);
  // S160 — spine-ness decides the video glyph; the entity is this slice's
  // legal read, and a prop would thread it through the panel for no gain.
  const spineTrackId = useSequenceStore(
    (state) => state.document?.sequence.spineTrackId ?? null,
  );

  /** S160 — while true the header row *is* the input; the draft lives in `RenameInput`. */
  const [renaming, setRenaming] = useState(false);
  /**
   * The options menu is **portalled to `document.body` at a fixed position**
   * (the `IconButton` tooltip's escape route, for the same reason): the
   * header carries `overflow-hidden` and sits inside the dock's scroll
   * container, so an absolutely-positioned child panel was clipped into
   * invisibility — the menu "didn't work" because it opened where nothing
   * could be seen (owner report, 2026-08-13). `null` position = closed.
   */
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuOpen = menuPosition !== null;
  const menuButtonRef = useRef<HTMLSpanElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(menuOpen, () => setMenuPosition(null), menuButtonRef, menuPanelRef);
  useEffect(() => {
    if (!menuOpen) return;
    // A scroll or resize invalidates the measured anchor; dismissing is
    // cheaper than tracking it and matches what the user means by scrolling.
    const hide = () => setMenuPosition(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [menuOpen]);

  // S173 — memoized: this used to run in the render body, so every panel
  // re-render re-laid-out every track and handed `WaveformCanvas` a fresh
  // array identity (full waveform repaint per pointermove). Both inputs are
  // identity-stable between document commits.
  const placed = useMemo(() => layoutTrack(clips, track), [clips, track]);
  const defaultHeight = track.kind === 'audio' ? 36 : 48;
  const [resizing, setResizing] = useState(false);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const height = Math.max(24, Math.min(300, liveHeight ?? (track.heightPx || defaultHeight)));
  const resizeOriginRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOriginRef.current = {
      startY: event.clientY,
      startHeight: height,
    };
    setResizing(true);
  };

  const handleResizePointerMove = (event: React.PointerEvent) => {
    if (!resizeOriginRef.current) return;
    const delta = event.clientY - resizeOriginRef.current.startY;
    const next = Math.max(24, Math.min(300, Math.round(resizeOriginRef.current.startHeight + delta)));
    setLiveHeight(next);
  };

  const handleResizePointerUp = (event: React.PointerEvent) => {
    if (!resizeOriginRef.current) return;
    const delta = event.clientY - resizeOriginRef.current.startY;
    const next = Math.max(24, Math.min(300, Math.round(resizeOriginRef.current.startHeight + delta)));
    resizeOriginRef.current = null;
    setResizing(false);
    setLiveHeight(null);
    if (next !== track.heightPx) {
      void patchTrack(track.id, { heightPx: next });
    }
  };

  const handleResizeDoubleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void patchTrack(track.id, { heightPx: defaultHeight });
  };

  const pixelsPerFrame = pixelsPerSecond / fps;
  const soloed = soloTrackIds.includes(track.id);
  // S165 — the lane's identity hue (text violet, overlay teal, neutral otherwise).
  const tone = laneToneOf(track, spineTrackId);
  // S166 — the spine is the composite's floor: its header never reorders.
  const isSpine = track.id === spineTrackId;

  return (
    <div
      className={`group/track relative flex items-stretch ${
        // S166 — a mid-drag row lifts the way a dragged clip does: an opacity
        // drop, never a scale or a ghost. (This also makes the row a stacking
        // context that contains the rail's z — harmless, since the rail only
        // ever needs to occlude its own row's clips; do not "fix" it.)
        dimmed || lifted ? 'opacity-60' : ''
      }`}
    >
      <div
        // S165 follow-up (owner, 2026-08-14): the rail paints no pill. S174 —
        // it is pinned (`sticky left-0`) so the labels survive a horizontal
        // scroll, which forces a background again or clips would scroll
        // visibly under the glyphs; the owner chose the panel's own canvas
        // tone, deliberately NOT the workspace pill S165 removed. Full
        // 152px wide with `pr-2` replacing the row's old horizontal gap, so
        // the trough still starts at exactly LANE_LABEL_WIDTH_PX. Rounding
        // and `overflow-hidden` stay: they still clip the rename input.
        className={`sticky left-0 z-[25] flex shrink-0 items-center gap-0.5 overflow-hidden rounded-[var(--radius-button)] bg-bg-canvas pl-1.5 pr-2 ${
          isSpine ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ width: LANE_LABEL_WIDTH_PX, height }}
        // S157 — dragging the header vertically reorders the track within its
        // kind group (video order is the composite's z-order). Buttons and the
        // rename input opt out; a still pointer stays a click, so the glyph's
        // double-click rename is untouched. S166 — the spine opts out whole.
        onPointerDown={(event) => {
          if (isSpine || event.button !== 0) return;
          if ((event.target as HTMLElement).closest('button, input')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onReorderStart(track, event.clientY);
        }}
        onPointerMove={(event) => onReorderMove(event.clientY)}
        onPointerUp={onReorderEnd}
        onPointerCancel={onReorderEnd}
      >
        {renaming ? (
          <RenameInput
            initialValue={track.name}
            ariaLabel={`Track name for ${track.name}`}
            maxLength={40}
            className="w-full min-w-0 rounded-[var(--radius-input)] border border-hairline bg-bg-app px-1 text-[11px] font-medium outline-none focus:border-text-disabled"
            onCommit={(name) => {
              setRenaming(false);
              void patchTrack(track.id, { name });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            {/* Track kind glyph — borderless, label-free, clean minimalist aesthetic */}
            <span
              role="button"
              tabIndex={0}
              title={`${track.name} — double-click to rename`}
              aria-label={track.name}
              className={`flex h-6 w-6 items-center justify-center shrink-0 cursor-pointer rounded select-none transition-colors hover:bg-bg-hover ${
                isSpine
                  ? 'text-accent-ai'
                  : isTextTrack(track)
                  ? 'text-purple-400'
                  : track.kind === 'video'
                  ? 'text-cyan-400'
                  : 'text-emerald-400'
              }`}
              onDoubleClick={() => setRenaming(true)}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault();
                  setRenaming(true);
                }
              }}
            >
              <span className="material-symbols-outlined text-[17px] leading-none">
                {kindGlyph(track, spineTrackId)}
              </span>
            </span>
            <span className="min-w-1 flex-1" />
            {/* S181 — the eye and the speaker, split.
                One icon used to mean both, because a video track had no audio
                to silence and `muted` was read as "hidden". Now that a video
                clip carries its own sound, hiding a picture and silencing it
                are separate decisions — the pair Premiere and Resolve draw
                for exactly this reason. Audio tracks keep the speaker alone:
                there is nothing to look at. */}
            {track.kind === 'video' ? (
              <IconButton
                size="sm"
                icon={track.videoEnabled ? 'visibility' : 'visibility_off'}
                label={track.videoEnabled ? `Hide ${track.name}` : `Show ${track.name}`}
                filled={!track.videoEnabled}
                onClick={() => void patchTrack(track.id, { videoEnabled: !track.videoEnabled })}
              />
            ) : null}
            <IconButton
              size="sm"
              icon={track.muted ? 'volume_off' : 'volume_up'}
              label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
              filled={track.muted}
              onClick={() => void patchTrack(track.id, { muted: !track.muted })}
            />
            {track.kind === 'audio' ? (
              <IconButton
                size="sm"
                icon="headphones"
                label={soloed ? `Unsolo ${track.name}` : `Solo ${track.name} (preview only)`}
                tone={soloed ? 'primary' : 'default'}
                filled={soloed}
                onClick={() => toggleSolo(track.id)}
              />
            ) : null}
            <IconButton
              size="sm"
              icon={track.locked ? 'lock' : 'lock_open'}
              label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
              filled={track.locked}
              onClick={() => void patchTrack(track.id, { locked: !track.locked })}
            />
            {/* Rename, role (audio) and delete live behind one menu — a fifth
                always-visible button does not fit the 144px header. */}
            <span ref={menuButtonRef}>
              <IconButton
                size="sm"
                icon="more_vert"
                label={`Options for ${track.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  if (menuOpen) {
                    setMenuPosition(null);
                    return;
                  }
                  const anchor = menuButtonRef.current?.getBoundingClientRect();
                  if (!anchor) return;
                  // Below the button, clamped on-screen; flips above when the
                  // dock's bottom edge would clip it.
                  // S170 fix — the flip clamp sizes from the *actual* item
                  // count. The S169 constant assumed the tallest menu, so a
                  // two-item spine menu "flipped" 254px up and landed
                  // stranded near the ruler (owner report, 2026-08-14).
                  // ~28px per row + gaps + container padding.
                  const itemCount =
                    1 + // rename
                    (onMoveUp ? 1 : 0) +
                    (onMoveDown ? 1 : 0) +
                    (track.kind === 'audio' ? 3 : 0) + // role radio group
                    5 + // S16 height presets
                    (isSpine ? 0 : 1); // delete
                  const menuHeight = itemCount * 28 + 24;
                  const top =
                    anchor.bottom + 4 + menuHeight > window.innerHeight
                      ? Math.max(8, anchor.top - 4 - menuHeight)
                      : anchor.bottom + 4;
                  setMenuPosition({
                    top,
                    left: Math.min(anchor.left, window.innerWidth - 216),
                  });
                }}
              />
              {menuPosition
                ? createPortal(
                    <div
                      ref={menuPanelRef}
                      role="menu"
                      aria-label={`Options for ${track.name}`}
                      style={{ top: menuPosition.top, left: menuPosition.left }}
                      className="fixed z-[60] flex w-52 flex-col gap-0.5 rounded-[var(--radius-button)] border border-hairline bg-bg-workspace p-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                        onClick={() => {
                          setMenuPosition(null);
                          setRenaming(true);
                        }}
                      >
                        Rename
                      </button>
                      {/* S166 — the drag's deterministic complement. Absent
                          (not disabled) at the stack edge and on the spine:
                          a menu item that never does anything is noise. */}
                      {onMoveUp ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                          onClick={() => {
                            setMenuPosition(null);
                            onMoveUp();
                          }}
                        >
                          Move up
                        </button>
                      ) : null}
                      {onMoveDown ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                          onClick={() => {
                            setMenuPosition(null);
                            onMoveDown();
                          }}
                        >
                          Move down
                        </button>
                      ) : null}
                      {track.kind === 'audio'
                        ? ROLE_LABELS.map((entry) => (
                            <button
                              key={entry.role ?? 'none'}
                              type="button"
                              role="menuitemradio"
                              aria-checked={track.role === entry.role}
                              className="flex w-full items-center gap-1 rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                              onClick={() => {
                                setMenuPosition(null);
                                void patchTrack(track.id, { role: entry.role });
                              }}
                            >
                              <span
                                aria-hidden="true"
                                className={`material-symbols-outlined text-[14px] ${track.role === entry.role ? '' : 'invisible'}`}
                              >
                                check
                              </span>
                              {entry.label}
                            </button>
                          ))
                        : null}
                      {/* S16 — Track Height Presets */}
                      <span aria-hidden="true" className="my-0.5 h-px w-full bg-hairline" />
                      <span className="px-2 py-0.5 text-[10px] font-semibold text-text-disabled uppercase tracking-wider">
                        Track Height
                      </span>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center justify-between rounded-[var(--radius-button)] px-2 py-1 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                        onClick={() => {
                          setMenuPosition(null);
                          void patchTrack(track.id, { heightPx: 28 });
                        }}
                      >
                        <span>Compact</span>
                        <span className="font-mono text-[10px] text-text-disabled">28px</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center justify-between rounded-[var(--radius-button)] px-2 py-1 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                        onClick={() => {
                          setMenuPosition(null);
                          void patchTrack(track.id, { heightPx: defaultHeight });
                        }}
                      >
                        <span>Standard (Default)</span>
                        <span className="font-mono text-[10px] text-text-disabled">{defaultHeight}px</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center justify-between rounded-[var(--radius-button)] px-2 py-1 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                        onClick={() => {
                          setMenuPosition(null);
                          void patchTrack(track.id, { heightPx: 96 });
                        }}
                      >
                        <span>Expanded (Filmstrip)</span>
                        <span className="font-mono text-[10px] text-text-disabled">96px</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center justify-between rounded-[var(--radius-button)] px-2 py-1 text-left text-xs text-text-primary transition-colors duration-100 hover:bg-bg-hover"
                        onClick={() => {
                          setMenuPosition(null);
                          void patchTrack(track.id, { heightPx: 140 });
                        }}
                      >
                        <span>Large</span>
                        <span className="font-mono text-[10px] text-text-disabled">140px</span>
                      </button>
                      {/* S170 fix — the spine is the sequence's default
                          track: no Delete item, and the repository refuses
                          the call anyway. */}
                      {isSpine ? null : (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-accent-warning transition-colors duration-100 hover:bg-accent-warning/15"
                          onClick={() => {
                            setMenuPosition(null);
                            void removeTrack(track.id);
                          }}
                        >
                          Delete track
                        </button>
                      )}
                    </div>,
                    document.body,
                  )
                : null}
            </span>
          </>
        )}
      </div>
      <div
        // S200 — the trough is a drop target with no accessible role of its
        // own; the attribute names it for tests and tooling.
        data-track-trough={track.id}
        className={`relative shrink-0 rounded-[var(--radius-button)] bg-bg-workspace ${
          track.locked ? 'opacity-60' : ''
        } ${dropTarget ? 'ring-1 ring-inset ring-accent-ai' : ''}`}
        style={{ height, width: Math.max(widthPx, 1) }}
        // S157 — a press on empty trough space (the trough itself, or the
        // waveform canvas painted over it) begins a marquee selection. A press
        // on a clip never reaches here: the clip captures its own pointer for
        // the move gesture.
        onPointerDown={(event) => {
          if (track.locked || event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target !== event.currentTarget && target.tagName !== 'CANVAS') return;
          onMarqueeStart(event, track);
        }}
        // S17 — Right click on empty trough space or waveform canvas opens gap / track context menu
        onContextMenu={(event) => {
          if (track.locked) {
            event.preventDefault();
            return;
          }
          const target = event.target as HTMLElement;
          if (target === event.currentTarget || target.tagName === 'CANVAS') {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const rawFrame = Math.max(0, (event.clientX - rect.left) / pixelsPerFrame);
            onTroughContextMenu?.(event, track, rawFrame);
          }
        }}
        onDragOver={(event) => {
          if (track.locked) return;
          const isInternalDrag = [...event.dataTransfer.types].includes(TIMELINE_DRAG_MIME);
          const isFileDrag = event.dataTransfer.types.includes('Files');
          if (!isInternalDrag && !isFileDrag) return;

          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const rawFrame = Math.max(0, (event.clientX - rect.left) / pixelsPerFrame);

          if (isInternalDrag) {
            const frame = onDropHover(track, rawFrame, event.altKey);
            if (frame === null) {
              event.dataTransfer.dropEffect = 'none';
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            event.currentTarget.style.setProperty(
              '--drop-x',
              `${(track.magnetic ? slotFrameFor(placed, frame) : frame) * pixelsPerFrame}px`,
            );
          } else if (isFileDrag) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            event.currentTarget.style.setProperty(
              '--drop-x',
              `${rawFrame * pixelsPerFrame}px`,
            );
          }
        }}
        onDrop={(event) => {
          if (track.locked) return;
          const payload = event.dataTransfer.getData(TIMELINE_DRAG_MIME);
          const hasFiles = event.dataTransfer.types.includes('Files');
          if (!payload && !hasFiles) return;

          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const rawFrame = Math.max(0, (event.clientX - rect.left) / pixelsPerFrame);

          if (payload) {
            const frame = onDropHover(track, rawFrame, event.altKey);
            if (frame === null) return;
            onDropFile(track, payload, frame);
          } else if (hasFiles && event.dataTransfer.files.length > 0 && onDropExternalFiles) {
            const droppedPaths = Array.from(event.dataTransfer.files)
              .map((file) => {
                try {
                  return window.api?.webUtils?.getPathForFile?.(file) || (file as any).path;
                } catch {
                  return (file as any).path;
                }
              })
              .filter((p): p is string => Boolean(p));
            if (droppedPaths.length > 0) {
              onDropExternalFiles(track, droppedPaths, rawFrame);
            }
          }
        }}
      >
        {/* S200 — the insertion ghost: one translucent block per dragged
            item, end-to-end from `--drop-x`, plus a leading bar on a
            magnetic lane (the slot marker). Rendered only on the target lane;
            its position is the trough's `--drop-x`. */}
        {dropItems ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-20 flex"
            style={{ left: 'var(--drop-x, 0px)' }}
          >
            {track.magnetic ? (
              <span className="absolute inset-y-0 -left-px w-0.5 bg-accent-ai" />
            ) : null}
            {dropItems.map((item, index) => (
              <span
                // Ghosts have no identity beyond their slot.
                key={index}
                className="my-0.5 rounded-[var(--radius-button)] border border-accent-ai/70 bg-accent-ai/15"
                style={{ width: Math.max(2, item.durationSeconds * pixelsPerSecond) }}
              />
            ))}
          </div>
        ) : null}
        {/* S17 — visual highlight when an empty space gap on this track is inspected / targeted */}
        {activeGap && activeGap.trackId === track.id ? (
          <div
            aria-label={`Gap: ${activeGap.durationFrames} frames`}
            className="pointer-events-none absolute inset-y-1 rounded border border-dashed border-amber-400/70 bg-amber-500/20 z-10 flex items-center justify-center overflow-hidden"
            style={{
              left: `${activeGap.startFrames * pixelsPerFrame}px`,
              width: `${Math.max(4, activeGap.durationFrames * pixelsPerFrame)}px`,
            }}
          >
            {activeGap.durationFrames * pixelsPerFrame >= 48 ? (
              <span className="text-[10px] font-mono font-semibold text-amber-300 px-1.5 py-0.5 rounded bg-bg-panel/90 border border-amber-500/30 whitespace-nowrap shadow-sm">
                Gap {activeGap.durationFrames}f
              </span>
            ) : null}
          </div>
        ) : null}
        {placed.map((item) => (
          <TimelineClip
            key={item.clip.id}
            clip={item.clip}
            fps={fps}
            leftPx={item.startFrames * pixelsPerFrame}
            widthPx={item.clip.durationFrames * pixelsPerFrame}
            heightPx={height}
            dragging={liveDragKind === 'move' && (liveDragClipIds?.has(item.clip.id) ?? false)}
            trimming={
              liveDragClipIds?.has(item.clip.id) && liveDragKind === 'trim-start'
                ? 'start'
                : liveDragClipIds?.has(item.clip.id) && liveDragKind === 'trim-end'
                  ? 'end'
                  : null
            }
            selected={selectedClipIds.includes(item.clip.id)}
            onSelect={track.locked ? () => undefined : onSelect}
            onToggleSelect={track.locked ? () => undefined : onToggleSelect}
            onMoveStart={track.locked ? () => undefined : onMoveStart}
            onTrimStart={track.locked ? () => undefined : onTrimStart}
            onContextMenu={track.locked ? (event) => event.preventDefault() : onClipContextMenu}
            onGainChange={track.locked ? () => undefined : onGainChange}
            onFadeChange={track.locked ? () => undefined : onFadeChange}
          />
        ))}
        {/* S182 — the video lane's sibling of the waveform canvas, on the same
            one-per-lane rule. Density follows the lane's height; see
            `FilmstripCanvas`. */}
        {track.kind === 'video' && placed.length > 0 ? (
          <>
            <FilmstripCanvas
              placed={placed}
              fps={fps}
              pixelsPerSecond={pixelsPerSecond}
              widthPx={Math.max(widthPx, 1)}
              heightPx={height}
            />
            <WaveformCanvas
              placed={placed}
              fps={fps}
              pixelsPerSecond={pixelsPerSecond}
              widthPx={Math.max(widthPx, 1)}
              heightPx={height}
              laneKind="video"
            />
          </>
        ) : null}
        {/* One canvas for the whole track's waveforms (§4.4 / Beta S151 H3) —
            one backing store and one redraw however many clips sit here. */}
        {track.kind === 'audio' && placed.length > 0 ? (
          <WaveformCanvas
            placed={placed}
            fps={fps}
            pixelsPerSecond={pixelsPerSecond}
            widthPx={Math.max(widthPx, 1)}
            heightPx={height}
          />
        ) : null}
      </div>
      {/* S16 — Interactive track height resize handle along the bottom border */}
      <div
        role="separator"
        aria-label={`Resize height for ${track.name}`}
        title={`${track.name} height: ${height}px — drag to resize, double-click to reset (${defaultHeight}px)`}
        className={`absolute inset-x-0 bottom-0 z-30 h-1.5 cursor-row-resize select-none transition-colors ${
          resizing ? 'bg-accent-ai' : 'hover:bg-accent-ai/50'
        }`}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onDoubleClick={handleResizeDoubleClick}
      />
    </div>
  );
}
