import type { ReactNode } from 'react';

import { InfoPopover } from './InfoPopover';

export interface SettingsRowProps {
  /** What the setting is, as a short noun phrase. Sentence case. */
  label: string;
  /**
   * Only when the control cannot speak for itself — a consequence the user
   * cannot infer, or a deliberate exception. Not a restatement of the label.
   */
  description?: string;
  /** The control. Sits right-aligned on one line with the label above `sm`. */
  children: ReactNode;
  /**
   * Set when the row's control is a single labelled element, so the row's
   * **label** names it.
   *
   * Beta S442 — the description is no longer inside this element. It never
   * belonged in an accessible name (several of these run to sixty words), and
   * the layout below needs it outside the label column anyway.
   */
  htmlFor?: string;
  /**
   * Beta S508 — the explanation a reader needs once, one hover away beside
   * the label, so `description` can stay a sentence.
   *
   * The Story Builder's render settings had nine descriptions of 20 to 83
   * words, one of them listing the prompt grammar's bracket names inline and
   * another citing an internal step number. `Section` already states the
   * rule (S137): guidance that only matters once belongs in an
   * `InfoPopover`, not in permanent vertical space above every control.
   */
  info?: ReactNode;
}

/**
 * One setting: what it is on the left, the control on the right (Beta S148).
 *
 * The Settings screen had grown three different hand-rolled versions of this
 * shape, each with its own gap, text sizes and wrap behaviour. Making it one
 * component is what lets the screen be a flat list of rows on the canvas rather
 * than a stack of cards — with no card border to separate them, the rows have
 * to align to read as a group, and they cannot align if each is drawn by hand.
 *
 * `items-start` rather than `items-center`: a two-line description must not
 * drag its control down to the vertical middle of the row.
 *
 * ## `min-w-44` is what makes `flex-wrap` work (Beta S194)
 *
 * `flex-1` is `flex: 1 1 0%`, and a flex line is broken on each item's
 * *hypothetical* main size — which for a `0%` basis is zero. So the label
 * contributed nothing to the wrap decision and the row never wrapped: faced
 * with a control it could not fit beside, it shrank the label to whatever was
 * left instead. In the Story Builder's 384px drawer that was ~60px, and
 * "Shots attach" plus its description rendered one word per line
 * (owner screenshot, 2026-08-15).
 *
 * A minimum width participates in that calculation, so the row now does what it
 * always looked like it would: keeps the control alongside while both fit, and
 * drops it onto its own full-width line when they don't. 11rem is the width at
 * which the longest label in the app still reads on two lines. Wide callers
 * (`SettingsModal` at `size="lg"`) are unaffected — nothing there was ever close
 * to the threshold.
 *
 * ## The description runs the full width (Beta S442)
 *
 * S194 fixed the *crush* — a label squeezed to 60px beside a control it could
 * not fit next to. It did not fix the ordinary case, because the description
 * still sat inside the label column: on a row whose control **does** fit, the
 * prose was confined to whatever the control left over and wrapped at roughly
 * half the drawer, with the space under the control left blank. In a 384px
 * drawer "Storyboard shows" and "Prompt grammar" were reading as narrow ragged
 * columns beside a dropdown and a two-option pill group (owner screenshot,
 * 2026-09-08).
 *
 * So the row is now two stacked things rather than two side-by-side ones: the
 * label and its control on one line — wrapping exactly as S194 made them — and
 * the description on its own line beneath, spanning the row. That is the shape
 * every settings list of this kind uses (macOS System Settings, GitHub, Linear),
 * and it is the only one where a long description does not pay for the width of
 * whatever control happens to sit beside its title.
 *
 * A consequence worth stating: when the control wraps, it now sits *between* the
 * label and the description rather than after both. That is the right order —
 * the description explains the options, and the reader meets them first.
 */
export function SettingsRow({ label, description, children, htmlFor, info }: SettingsRowProps) {
  const Label = htmlFor ? 'label' : 'div';

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        {info ? (
          // Beta S508 — the popover sits beside the label, never inside it: a
          // `<label>` forwards clicks to its control, so a trigger inside one
          // would toggle the switch it was meant to explain. `min-w-44 flex-1`
          // moves to the wrapper, which is now the flex item S194 sized.
          <div className="flex min-w-44 flex-1 items-center gap-1">
            <Label className="text-sm text-text-primary" {...(htmlFor ? { htmlFor } : {})}>
              {label}
            </Label>
            <InfoPopover label={`About ${label}`} align="left">
              {info}
            </InfoPopover>
          </div>
        ) : (
          <Label className="min-w-44 flex-1 text-sm text-text-primary" {...(htmlFor ? { htmlFor } : {})}>
            {label}
          </Label>
        )}
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
      {description ? (
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      ) : null}
    </div>
  );
}
