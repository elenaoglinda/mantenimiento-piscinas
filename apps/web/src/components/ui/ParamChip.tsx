import type { ParameterStatus } from '@piscinas/shared';
import { cn } from './utils.js';
import { toneClass } from './variants.js';

/**
 * One water reading: name, value and unit, tinted by its status. "Cl libre 1,2 ppm".
 * Values are tabular so a row of chips lines up.
 */
export function ParamChip({
  label,
  value,
  unit,
  status = 'unknown',
  title,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  status?: ParameterStatus;
  /** Extra detail on hover, e.g. the allowed range. */
  title?: string;
  className?: string;
}) {
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
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums">
        {shown}
        {unit && shown !== '—' && <span className="ml-0.5 font-normal">{unit}</span>}
      </span>
    </span>
  );
}
