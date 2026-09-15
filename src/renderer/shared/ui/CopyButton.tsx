import { useEffect, useRef, useState } from 'react';

import { copyText } from '../lib/copyText';

import { IconButton } from './IconButton';

export interface CopyButtonProps {
  /** The text put on the clipboard. Empty or absent disables the control. */
  text: string;
  /**
   * What is being copied, as a noun phrase — `prompt`, `the final prompt`,
   * `negative prompt`. The label reads `Copy {label}`; do not pass the verb.
   */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** How long the tick — or the failure — stays up before the button offers the copy again. */
const CONFIRM_MS = 1500;

/**
 * Beta S218 — one copy button, for every place the app offers a copy.
 *
 * There were three of these: `CopyPromptButton` in the Story Builder,
 * `CopyButton` inside `PresetDetailModal`, and an inline `copyPrompt` plus a
 * hand-wired `IconButton` in `VideoLightboxModal`. Identical logic, identical
 * 1500ms tick — and identical bug, because all three called
 * `navigator.clipboard.writeText` with no `catch`. When the permission policy
 * refused the write, all three failed the same way and all three failed
 * *silently*. One implementation is what stops the next such change from
 * having to be found three times.
 *
 * ## The failure state is the point
 *
 * A copy has exactly three outcomes and the button now shows all three: offer,
 * tick, and — new — `Copy failed` in the danger tone. It was the missing third
 * that turned a broken permission into an unreportable bug: the owner could
 * only say "I can't copy the prompt", because the app said nothing whatsoever.
 *
 * The confirmation stays *in the button* rather than becoming a toast. These
 * sit in modal field labels, where a toast at the window's edge is the wrong
 * place to look for the answer to "did that work?" — the reasoning
 * `CopyPromptButton` was written with, kept.
 */
export function CopyButton({ text, label, size, className }: CopyButtonProps) {
  const [outcome, setOutcome] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The modal can close while the tick is still up; a timer left running would
  // set state on a component that is gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!text) {
      return;
    }
    setOutcome((await copyText(text)) ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOutcome('idle'), CONFIRM_MS);
  };

  return (
    <IconButton
      icon={outcome === 'copied' ? 'check' : outcome === 'failed' ? 'error' : 'content_copy'}
      label={
        outcome === 'copied' ? 'Copied' : outcome === 'failed' ? 'Copy failed' : `Copy ${label}`
      }
      tone={outcome === 'failed' ? 'danger' : 'default'}
      disabled={!text}
      size={size}
      className={className}
      onClick={() => void copy()}
    />
  );
}
