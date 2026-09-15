import type { ReactNode } from 'react';

import { Card } from './Card';

export interface EmptyStateCardProps {
  icon: string;
  title: string;
  description?: string;
  /**
   * Beta S412 — the one thing to do about the emptiness, as a control rather
   * than as a sentence pointing at one somewhere else.
   *
   * Optional, and most callers have nothing to put here: a library with no
   * results is empty because of a filter, not because of a missing action. It
   * exists for the placeholders that were describing a button — the shot
   * modal's filmstrip told the reader to "press Render on the card", meaning a
   * card behind the dialog they were reading.
   */
  action?: ReactNode;
}

/** Borderless placeholder for empty lists/grids — sentence-case copy, Material Symbols Outlined icon. */
export function EmptyStateCard({ icon, title, description, action }: EmptyStateCardProps) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="material-symbols-outlined text-3xl text-text-disabled">{icon}</span>
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {description ? <p className="max-w-sm text-xs text-text-disabled">{description}</p> : null}
      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </Card>
  );
}
