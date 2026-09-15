import { useConfirmArm } from '../lib/useConfirmArm';

import { IconButton, type IconButtonProps } from './IconButton';

/**
 * Beta S207 — an `IconButton` that confirms on a second press.
 *
 * `useConfirmArm` plus `IconButton`, with the convention the Story Builder had
 * already converged on by hand at every destructive control: the glyph flips to
 * `check`, `emphasis` fills the button in its danger tone, and the label
 * becomes the consequence rather than the action.
 *
 * The label is the whole reason this is a component and not a bare hook call.
 * `IconButton.label` is both the accessible name and the tooltip, so the armed
 * label is the only place a two-press control can state what the second press
 * will do — and S93 established that it must state a *consequence with a number
 * in it* ("Press again — trashes 12 stills, clears approvals"), not a bare
 * "Are you sure?". A hook alone leaves that to be remembered per site.
 *
 * Disarming — on blur, on Escape, and on a changed `armKey` — lives in the
 * hook; see its doc for why each one exists.
 */

export interface ConfirmIconButtonProps
  extends Omit<IconButtonProps, 'icon' | 'label' | 'onClick' | 'onBlur' | 'onKeyDown'> {
  /** Resting glyph. */
  icon: string;
  /** Armed glyph. `check` is the convention every hand-rolled site already used. */
  armedIcon?: string;
  /** Resting label — the action. */
  label: string;
  /** Armed label — the consequence, with its count where there is one. */
  armedLabel: string;
  /**
   * Identity of the thing this button currently targets; changing it disarms.
   * Omit when the target cannot move under the button.
   */
  armKey?: string;
  /** Runs on the second press only. */
  onConfirm: () => void;
}

export function ConfirmIconButton({
  icon,
  armedIcon = 'check',
  label,
  armedLabel,
  armKey,
  onConfirm,
  tone = 'danger',
  ...rest
}: ConfirmIconButtonProps) {
  const arm = useConfirmArm(armKey);

  return (
    <IconButton
      {...rest}
      icon={arm.armed ? armedIcon : icon}
      label={arm.armed ? armedLabel : label}
      tone={tone}
      emphasis={arm.armed}
      onClick={() => {
        if (arm.press()) onConfirm();
      }}
      {...arm.guardProps}
    />
  );
}
