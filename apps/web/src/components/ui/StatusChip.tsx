import { useTranslation } from 'react-i18next';
import type { ParameterStatus } from '@piscinas/shared';
import { StatusPill } from './StatusPill.js';

/** A parameter status ("En rango", "Fuera de rango"…) as a `StatusPill`. */
export function StatusChip({ status }: { status: ParameterStatus }) {
  const { t } = useTranslation();
  return <StatusPill tone={status}>{t(`status.${status}`)}</StatusPill>;
}
