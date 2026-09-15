import type { ReactNode } from 'react';

export type StatusRowTone = 'neutral' | 'muted' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusRowProps {
  /** A Material Symbols ligature — `error`, `warning`, `check_circle`, `history`. */
  icon: string;
  /** Colours the icon only. The row itself never takes an accent fill. */
  tone?: StatusRowTone;
  /** What the row is, in a few words. */
  title: ReactNode;
  /** Why, or what to do. Clamped to two lines; the full text stays in the DOM. */
  detail?: ReactNode;
  /** One control or chip at the end of the row — Open shot, Copy id. */
  trailing?: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<StatusRowTone, string> = {
  neutral: 'text-text-secondary',
  muted: 'text-text-disabled',
  success: 'text-accent-success',
  warning: 'text-accent-warning',
  danger: 'text-accent-danger',
  info: 'text-accent-info',
};

/**
 * Beta S508 — one status line in a report: an icon that carries the state, a
 * short title, and a detail line.
 *
 * Both report dialogs had grown their own version of this shape and neither was
 * scannable. The continuity report wrote each finding as an 11px paragraph that
 * opened with a coloured word, so a critical and an advisory read the same until
 * you reached the end of the word. The Flow duplicates report drew each take as a
 * bordered box led by its raw media id, with "in use" as a green-tinted border.
 *
 * The state lives in the **icon's colour and shape**, not in a fill or a border:
 * the design system is borderless and keeps accents for marking state, never for
 * large surfaces. Two shapes per severity (`error` versus `warning`) also keep the
 * row legible to someone who cannot tell coral from amber.
 */
export function StatusRow({
  icon,
  tone = 'neutral',
  title,
  detail,
  trailing,
  className = '',
}: StatusRowProps) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[var(--radius-button)] px-2 py-1.5 transition-colors duration-100 ease-out hover:bg-bg-hover ${className}`}
    >
      <span
        aria-hidden="true"
        className={`material-symbols-outlined mt-px shrink-0 text-lg leading-none ${TONE_CLASSES[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary">{title}</div>
        {detail ? <div className="line-clamp-2 text-xs text-text-secondary">{detail}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-1 self-center">{trailing}</div> : null}
    </div>
  );
}
