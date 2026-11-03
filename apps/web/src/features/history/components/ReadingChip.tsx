import { useTranslation } from 'react-i18next';
import type { ParameterStatus } from '@piscinas/shared';
import { ParamChip } from '../../../components/ui/ParamChip.js';
import { formatValue } from '../lib/format.js';

/** A reading with its traffic light; amber and red are also marked with an icon and in words. */
export function ReadingChip({
  label,
  value,
  unit,
  status,
  title,
  className,
}: {
  label: string;
  value: number | null;
  unit?: string | null;
  status: ParameterStatus;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ParamChip
      label={label}
      value={formatValue(value)}
      // pH has no unit, but the catalogue stores "pH" as one; don't print "pH 7,4 pH".
      unit={unit && unit !== 'pH' ? unit : undefined}
      status={value == null ? 'unknown' : status}
      statusLabel={t(`status.${status}`)}
      title={title}
      className={className}
    />
  );
}
