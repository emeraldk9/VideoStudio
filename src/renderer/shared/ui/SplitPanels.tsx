import type { ReactNode } from 'react';

export interface SplitPanelsProps {
  left: ReactNode;
  right: ReactNode;
  /**
   * `even` for two columns of comparable weight (a bank beside a catalog);
   * `wide-right` when the right column holds a table and the left holds a form;
   * `rail-left` when the screen is full-bleed and the form must not scale with
   * the window — the left column is capped like a settings rail (the pattern
   * editors from Resolve to Descript use for an inspector beside a canvas),
   * and the right column takes everything that remains.
   */
  ratio?: 'even' | 'wide-right' | 'rail-left';
  /** Accessible names for the two regions — a column is a landmark, not a div. */
  leftLabel: string;
  rightLabel: string;
  /**
   * Beta S150 — take the parent's full height and let each column scroll on its
   * own, instead of both growing and pushing the page.
   *
   * Two-column only. Stacked (below `lg`) the columns are one reading order, so
   * capping the pair at one viewport would give each half a window and make
   * both worse; there, growth and a page scroll is the right answer. Opt-in
   * because it requires the caller's ancestors to have a definite height —
   * `flex-1` inside a bounded parent, not content-sizing all the way up.
   */
  fill?: boolean;
}

const RATIO_CLASSES: Record<NonNullable<SplitPanelsProps['ratio']>, string> = {
  even: 'lg:grid-cols-2',
  'wide-right': 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
  // 360–480px: what `wide-right` gave the form under the old 1440px page cap,
  // now held constant so a wider window widens only the table side.
  'rail-left': 'lg:grid-cols-[minmax(360px,480px)_minmax(0,1fr)]',
};

/**
 * The two-column workspace layout (Beta S137).
 *
 * One place decides the gutter, the breakpoint and the stacking order, so the
 * three Voice workspaces cannot drift into three near-identical grids the way
 * their headers and cards did. Collapses to a single column below `lg` — the
 * columns are a reading order (author on the left, refine on the right), not a
 * dependency, so stacking loses nothing.
 *
 * Deliberately no surface of its own: the panels sit directly on the canvas.
 * Boxing each column in a `Card` would put a card inside a card inside a card
 * once the sections below add their own bordered groups.
 */
export function SplitPanels({
  left,
  right,
  ratio = 'wide-right',
  leftLabel,
  rightLabel,
  fill = false,
}: SplitPanelsProps) {
  // `lg:` on every one of these: below the breakpoint the grid is a single
  // column and filling would stack two scroll panes inside one screen.
  const gridFill = fill ? 'lg:h-full lg:min-h-0' : '';
  const columnFill = fill ? 'lg:min-h-0 lg:overflow-y-auto' : '';
  return (
    <div className={`grid grid-cols-1 gap-x-8 gap-y-6 ${RATIO_CLASSES[ratio]} ${gridFill}`}>
      <section aria-label={leftLabel} className={`flex min-w-0 flex-col gap-5 ${columnFill}`}>
        {left}
      </section>
      <section aria-label={rightLabel} className={`flex min-w-0 flex-col gap-5 ${columnFill}`}>
        {right}
      </section>
    </div>
  );
}
