import { useTranslation } from 'react-i18next';
import type { ParameterStatus } from '@piscinas/shared';

const styles: Record<ParameterStatus, string> = {
  green: 'bg-status-green-bg text-status-green-text',
  amber: 'bg-status-amber-bg text-status-amber-text',
  red: 'bg-status-red-bg text-status-red-text',
  unknown: 'bg-status-unknown-bg text-status-unknown-text',
};

export function StatusChip({ status }: { status: ParameterStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-[var(--radius-full)] px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
