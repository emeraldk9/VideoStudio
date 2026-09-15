import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/**
 * The half every field shares: focus, disabled, transition, placeholder.
 *
 * `outline-none` plus the inset ring is not decoration — it is what stops the
 * browser's own focus ring showing. Tailwind v4's Preflight leaves that default
 * in place, and Chromium's legacy `-webkit-focus-ring-color` is **amber**, so
 * any control that omits this paints a colour that appears nowhere else in the
 * design system. That is exactly what the Voice module did (Beta S155): it was
 * the one module that hand-rolled its `<input>`/`<textarea>` elements instead of
 * using these primitives, and every one of them focused amber.
 */
const FIELD_FOCUS =
  'outline-none transition-colors duration-100 ease-out focus:ring-2 focus:ring-inset focus:ring-text-primary/40 disabled:cursor-not-allowed disabled:opacity-50';

const FIELD_BASE = `w-full rounded-[var(--radius-input)] bg-bg-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled ${FIELD_FOCUS}`;

/**
 * Beta S155 — the Voice module's field look, as a variant rather than a
 * per-call-site class string.
 *
 * The module's fields sit *on* a panel rather than in a form column: app
 * background, a hairline border, and (for scripts and numeric cells) a mono
 * face. That is a legitimate second look, and the sixteen hand-rolled controls
 * all spelled it the same way — they simply forgot the focus half.
 *
 * It is a variant rather than an appended `className` because the two looks
 * differ in *many* properties at once — a call site restating five utilities
 * per field is how the sixteen hand-rolled controls drifted in the first
 * place. Single-property adjustments on top of a variant (a width, a height)
 * are legitimate, and `cn` (tailwind-merge) makes them deterministic: the
 * caller's class beats the variant's for the same property, by class-list
 * order, not by where each utility landed in the stylesheet. Before `cn`,
 * `w-16` passed alongside the variants' `w-full` was a coin toss — and the
 * coin landed on `w-full`, which is how the Tune card's numeric cells each
 * grew to the row's full width and pushed the table off-screen (2026-08-13).
 */
const FIELD_SCRIPT = `w-full rounded-[var(--radius-input)] border border-hairline bg-bg-app px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled ${FIELD_FOCUS}`;

export type FieldVariant = 'default' | 'script';

function fieldClasses(variant: FieldVariant): string {
  return variant === 'script' ? FIELD_SCRIPT : FIELD_BASE;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { variant?: FieldVariant };

/**
 * Forwards its ref for the same reason `Textarea` does: a caller that mounts
 * this conditionally needs to focus it on mount, and the mount *is* the event —
 * routing that through an effect would mean setting state from an effect for no
 * gain. `EntityDetailModal`'s `+ Look` field is the first such caller.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', variant = 'default', ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldClasses(variant), className)} {...rest} />;
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Beta S155 — a checkbox that takes the theme and the app's focus ring.
 *
 * Deliberately not `Input` with `type="checkbox"`: the field classes are wrong
 * for a box (`w-full` above all), which is exactly the trap this primitive
 * exists to close. `accent-color` is what tints the native control — there is
 * no other way to reach a checkbox's fill — and the focus ring is the same one
 * every other control in the app uses, rather than Chromium's amber default.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(`h-3.5 w-3.5 shrink-0 rounded-[3px] accent-[var(--accent-info)] ${FIELD_FOCUS}`, className)}
      {...rest}
    />
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: FieldVariant;
};

/**
 * Forwards its ref so callers can measure/resize the underlying `<textarea>`.
 *
 * Renders the element directly, with no wrapper. It used to sit inside a
 * `<div class="w-full">` that existed only to hang an `x/maxLength` counter
 * off — and that wrapper is why a caller passing `flex-1` got a short box: the
 * class landed on the textarea while the div between it and the flex parent
 * sized to content and never grew. The counter is gone (the script box imposes
 * no limit), so the wrapper goes with it.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', variant = 'default', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        fieldClasses(variant),
        variant === 'script' ? 'p-2.5 font-mono leading-relaxed' : 'min-h-24',
        'resize-y',
        className,
      )}
      {...rest}
    />
  );
});
