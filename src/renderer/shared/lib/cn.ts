import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class lists so the *last* class wins its property, instead of
 * whichever happens to sit later in the generated stylesheet.
 *
 * Exists because of a real casualty (2026-08-13): the field primitives emit
 * `w-full`, `SegmentTable` passed `w-16` for its numeric cells, both utilities
 * reached the DOM, and stylesheet order picked `w-full` — every start/length
 * cell became a full-width, non-shrinking flex item, and the whole Tune card
 * blew out sideways into a page-wide horizontal scrollbar. `Input.tsx`'s
 * variant system was designed around "never emit both", and this is the tool
 * that makes that guarantee hold for the caller's half of the class list too.
 *
 * Use it in shared primitives that accept `className`; call sites keep writing
 * plain template strings. Order matters: put the caller's `className` last.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
