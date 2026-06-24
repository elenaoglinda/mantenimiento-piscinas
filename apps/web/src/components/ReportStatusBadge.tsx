import { useTranslation } from 'react-i18next';
import type { Enums } from '../lib/database.types.js';

const styles: Record<Enums<'report_status'>, string> = {
  draft: 'bg-surface-muted text-text-muted',
  completed: 'bg-status-amber-bg text-status-amber',
  signed: 'bg-status-green-bg text-status-green',
};

export function ReportStatusBadge({ status }: { status: Enums<'report_status'> }) {
  const { t } = useTranslation();
  return (
    <span
      className={`shrink-0 rounded-[var(--radius-full)] px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {t(`reportStatus.${status}`)}
    </span>
  );
}
