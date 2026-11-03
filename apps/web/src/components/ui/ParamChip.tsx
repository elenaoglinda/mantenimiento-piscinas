import type { ParameterStatus } from '@piscinas/shared';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { cn } from './utils.js';
import { toneClass } from './variants.js';

/**
 * One water reading: name, value and unit, tinted by its status. "Cl libre 1,2 ppm".
 * Values are tabular so a row of chips lines up. Pass `statusLabel` to also mark amber and red
 * readings with an icon and say the status to screen readers, so it isn't colour alone.
 */
export function ParamChip({
  label,
  value,
  unit,
  status = 'unknown',
  title,
  statusLabel,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  status?: ParameterStatus;
  /** Extra detail on hover, e.g. the allowed range. */
  title?: string;
  /** "Fuera de rango", "Atención"… — shown as an icon + screen-reader text for amber/red. */
  statusLabel?: string;
  className?: string;
}) {
  const marked = statusLabel && (status === 'red' || status === 'amber');
  const Icon = status === 'red' ? TriangleAlert : CircleAlert;
  const shown = value === null || value === undefined || value === '' ? '—' : value;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-xs',
        toneClass[status],
        className,
      )}
    >
      {marked && <Icon aria-hidden size={12} className="shrink-0 self-center" />}
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums">
        {shown}
        {unit && shown !== '—' && <span className="ml-0.5 font-normal">{unit}</span>}
      </span>
      {marked && <span className="sr-only">, {statusLabel}</span>}
    </span>
  );
}
