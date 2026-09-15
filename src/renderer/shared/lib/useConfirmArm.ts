import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';

/**
 * Beta S207 — the two-press arm, as one implementation.
 *
 * The Story Builder confirms every destructive action by arming it: the first
 * press re-labels the control with the consequence, the second performs it.
 * `PurgeOrphansButton.tsx:16-35` states when that is the right ceremony —
 * removing **renders** is recoverable (files move to `.storyapp/trash/`), so an
 * inline arm is proportionate; removing **structure** earns a real dialog.
 *
 * It was hand-rolled at eight sites, each with its own `confirming` state, its
 * own `icon={armed ? 'check' : …}` ternary and its own `onBlur`. They agreed on
 * the shape and disagreed on the details — one clears the arm unconditionally
 * on blur, its sibling twenty lines away clears only on an id match — and all
 * eight share two gaps this closes:
 *
 * - **Escape does not disarm.** An armed delete stays armed until something
 *   takes focus away, so the obvious way to back out does nothing. Escape is
 *   swallowed here *only* while armed: unarmed, it must keep bubbling, or a
 *   control inside a dialog would trap the user in it.
 * - **A changed target does not disarm.** `ShotTakesPanel`'s delete button
 *   points at whichever take is being viewed, and that moves under a mounted
 *   button. Arming it for take A and then browsing to take B left a control
 *   labelled "Press again to delete" aimed at something the user never armed.
 *   `armKey` is that identity; changing it disarms.
 *
 * Separate from `ConfirmIconButton` because three of the sites are not
 * `IconButton`s at all — the look chip's 16px `×`, the collapsed "N failed"
 * chip, and `TakeSweepMenu`'s menu rows — and they need the arm without the
 * button.
 */

export interface ConfirmArm {
  armed: boolean;
  /**
   * Records one press. Returns `true` when the caller should **act** — that is,
   * on the second press. The first press only arms and returns `false`.
   */
  press: () => boolean;
  disarm: () => void;
  /**
   * Spread onto the armed control. Carries the blur and Escape disarms; a
   * caller's own handlers still run if it spreads these before its own.
   */
  guardProps: {
    onBlur: (event: FocusEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
}

/**
 * @param armKey Identity of what this control currently targets. Changing it
 *   disarms. Omit for a control whose target cannot move.
 */
export function useConfirmArm(armKey?: string): ConfirmArm {
  const [armed, setArmed] = useState(false);
  const previousKey = useRef(armKey);

  useEffect(() => {
    if (previousKey.current === armKey) return;
    previousKey.current = armKey;
    setArmed(false);
  }, [armKey]);

  const disarm = useCallback(() => setArmed(false), []);

  const press = useCallback(() => {
    if (armed) {
      setArmed(false);
      return true;
    }
    setArmed(true);
    return false;
  }, [armed]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || !armed) return;
      // Only while armed. `Modal` listens for Escape on `document`
      // (`Modal.tsx:107`), so an unconditional stop would make Escape stop
      // closing the dialog this control usually sits inside.
      event.preventDefault();
      event.stopPropagation();
      setArmed(false);
    },
    [armed],
  );

  return {
    armed,
    press,
    disarm,
    guardProps: { onBlur: disarm, onKeyDown },
  };
}
