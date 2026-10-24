import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from './utils.js';

const fill = {
  accent: 'bg-accent',
  green: 'bg-status-green',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
} as const;

/** Horizontal progress, e.g. "SILOÉ 2026: 8 de 12 piscinas listas". */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'accent',
  className,
}: {
  value: number;
  max?: number;
  /** Accessible name; also shown above the bar when `showLabel`. */
  label: string;
  tone?: keyof typeof fill;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-[width] duration-300', fill[tone])}
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
