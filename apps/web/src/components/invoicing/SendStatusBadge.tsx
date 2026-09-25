import { useTranslation } from 'react-i18next';
import type { Enums } from '../../lib/database.types.js';

/**
 * One badge for two related facts: whether the document is a draft, and where its Veri*Factu
 * record stands at AEAT. A draft has no AEAT state at all, so it is shown on its own.
 */
export function SendStatusBadge({
  status,
  sendStatus,
}: {
  status: Enums<'invoice_status'>;
  sendStatus: Enums<'invoice_send_status'>;
}) {
  const { t } = useTranslation();

  if (status === 'draft') {
    return (
      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">
        {t('invoicing.status.draft')}
      </span>
    );
  }

  const tone: Record<Enums<'invoice_send_status'>, string> = {
    not_sent: 'bg-surface-muted text-text-muted',
    queued: 'bg-surface-muted text-text-muted',
    sending: 'bg-status-amber/15 text-status-amber',
    accepted: 'bg-status-green/15 text-status-green',
    rejected: 'bg-status-red/15 text-status-red',
    failed: 'bg-status-red/15 text-status-red',
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone[sendStatus]}`}>
      {t(`invoicing.sendStatus.${sendStatus}`)}
    </span>
  );
}
