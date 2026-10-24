import type { ReactNode } from 'react';
import { cn } from './utils.js';
import { toneClass, type Tone } from './variants.js';

const dotClass: Record<Tone, string> = {
  green: 'bg-status-green',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
  unknown: 'bg-status-unknown',
  info: 'bg-accent',
  neutral: 'bg-text-muted',
};

/**
 * Small rounded label for a state ("Enviada", "Fuera de rango", "Pendiente"). The text carries
 * the meaning; colour and dot only reinforce it.
 */
export function StatusPill({
  tone = 'neutral',
  dot = true,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotClass[tone])} />}
      {children}
    </span>
  );
}
