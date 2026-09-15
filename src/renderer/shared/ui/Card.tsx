import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

/** Flat card by default; `elevated` applies the one sanctioned shadow token per the design system's elevation rule. */
export function Card({ elevated = false, className = '', style, children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] bg-bg-workspace p-4 ${className}`}
      style={{ boxShadow: elevated ? 'var(--shadow-elevated)' : undefined, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
