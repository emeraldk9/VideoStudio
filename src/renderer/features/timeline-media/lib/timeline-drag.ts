import {
  TIMELINE_DRAG_MIME,
  encodeTimelineDrag,
  parseTimelineDrag,
  type TimelineDragSource,
} from '@shared';

import { useMediaDragStore } from '../../../entities/sequence';

/**
 * Beta S200 — one way to start a pool → lane drag, for every card in the pool.
 *
 * Three things happen at `dragstart`, and every emitter (media tile, text
 * card, effect card) needs all three, so they live here rather than in each:
 *
 * 1. The v2 payload goes on the drag under the module's private MIME type.
 * 2. A **drag image** replaces the browser's default (a ghost of the one
 *    element under the pointer): a small stacked card with the count — the
 *    Finder / Premiere idiom, and the only visual cue that a multi-selection
 *    is what is being carried. Rendered into an off-screen node, because
 *    `setDragImage` needs an element in the document at call time; removed
 *    on `dragend`.
 * 3. The resolved items are published to `mediaDragStore`, because the lanes
 *    cannot read `getData` during `dragover` and their insertion ghost needs
 *    N and the durations. Cleared on `dragend`.
 *
 * `dragend` fires on the *source* element however the drag ends (drop,
 * Escape, release outside a target), and bubbles — one document-level
 * listener per drag is enough.
 */
export function beginTimelineDrag(event: React.DragEvent, sources: readonly TimelineDragSource[]): void {
  if (sources.length === 0) return;
  const text = encodeTimelineDrag(sources);
  event.dataTransfer.setData(TIMELINE_DRAG_MIME, text);
  event.dataTransfer.effectAllowed = 'copy';

  const ghost = buildDragImage(sources);
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, 12);

  useMediaDragStore.getState().begin(parseTimelineDrag(text));

  const cleanup = () => {
    ghost.remove();
    useMediaDragStore.getState().end();
  };
  document.addEventListener('dragend', cleanup, { once: true });
}

/**
 * The stacked-card ghost. Two offset cards under one labelled card, plus a
 * count badge when more than one item rides the drag. Tailwind classes, so
 * it follows the theme like every tile; positioned far off-screen so it is
 * never seen in place — the browser snapshots it for the cursor.
 */
function buildDragImage(sources: readonly TimelineDragSource[]): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.className = 'pointer-events-none fixed left-0 top-0 z-50';
  root.style.transform = 'translate(-2000px, -2000px)';

  const stack = document.createElement('div');
  stack.className = 'relative h-16 w-28';
  const count = sources.length;
  const layers = Math.min(3, count);
  for (let index = layers - 1; index >= 0; index -= 1) {
    const card = document.createElement('div');
    card.className =
      'absolute inset-0 flex items-end overflow-hidden rounded-[var(--radius-button)] border border-hairline bg-bg-selected shadow-md';
    card.style.transform = `translate(${index * 4}px, ${-index * 4}px)`;
    if (index === 0) {
      const label = document.createElement('span');
      label.className = 'w-full truncate px-1.5 py-1 text-[10px] leading-4 text-text-primary';
      label.textContent = sources[0]?.label ?? '';
      card.appendChild(label);
    }
    stack.appendChild(card);
  }
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className =
      'absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-ai px-1.5 font-mono text-[11px] font-semibold leading-none text-text-on-accent';
    badge.textContent = String(count);
    stack.appendChild(badge);
  }
  root.appendChild(stack);
  return root;
}
