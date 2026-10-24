import { useTranslation } from 'react-i18next';
import { fiscalState, isOverdue, type FiscalState } from '@piscinas/shared';
import type { Enums } from '../../../lib/database.types.js';

const TONE: Record<FiscalState, string> = {
  draft: 'bg-surface-muted text-text-muted',
  pending_send: 'bg-status-amber/15 text-status-amber-text',
  sent: 'bg-status-green/15 text-status-green-text',
  sent_with_errors: 'bg-status-amber/15 text-status-amber-text',
  rejected: 'bg-status-red/15 text-status-red-text',
  cancelled: 'bg-surface-muted text-text-muted line-through',
  rectified: 'bg-surface-muted text-text-muted',
};

export interface FiscalBadgeInvoice {
  status: Enums<'invoice_status'>;
  send_status: Enums<'invoice_send_status'>;
  aeat_estado: string | null;
  rectified?: boolean;
}

/** The fiscal badge. Payment is a separate axis and gets its own. */
export function FiscalStateBadge({ invoice }: { invoice: FiscalBadgeInvoice }) {
  const { t } = useTranslation();
  const state = fiscalState({
    status: invoice.status,
    sendStatus: invoice.send_status,
    aeatEstado: invoice.aeat_estado,
    hasRectificativa: invoice.rectified,
  });
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[state]}`}>
      {t(`invoicing.fiscal.${state}`)}
    </span>
  );
}

/** Pendiente · Pagada · Vencida. Vencida is derived, never stored. */
export function PaymentBadge({
  paymentStatus,
  dueDate,
  status,
}: {
  paymentStatus: Enums<'invoice_payment_status'>;
  dueDate: string | null;
  status: Enums<'invoice_status'>;
}) {
  const { t } = useTranslation();
  if (status === 'draft') return null;

  const overdue = isOverdue(dueDate, paymentStatus);
  const key = paymentStatus === 'paid' ? 'paid' : overdue ? 'overdue' : 'pending';
  const tone =
    key === 'paid'
      ? 'bg-status-green/15 text-status-green-text'
      : key === 'overdue'
        ? 'bg-status-red/15 text-status-red-text'
        : 'bg-surface-muted text-text-muted';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {t(`invoicing.payment.${key}`)}
    </span>
  );
}
