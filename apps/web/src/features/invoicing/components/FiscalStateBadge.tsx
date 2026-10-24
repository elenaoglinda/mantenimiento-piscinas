import { useTranslation } from 'react-i18next';
import { fiscalState, isOverdue, type FiscalState } from '@piscinas/shared';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import type { Tone } from '../../../components/ui/variants.js';
import type { Enums } from '../../../lib/database.types.js';

const TONE: Record<FiscalState, Tone> = {
  draft: 'neutral',
  pending_send: 'amber',
  sent: 'green',
  sent_with_errors: 'amber',
  rejected: 'red',
  cancelled: 'neutral',
  rectified: 'info',
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
    <StatusPill tone={TONE[state]} className={state === 'cancelled' ? 'line-through' : undefined}>
      {t(`invoicing.fiscal.${state}`)}
    </StatusPill>
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
  const tone: Tone = key === 'paid' ? 'green' : key === 'overdue' ? 'red' : 'neutral';
  return (
    <StatusPill tone={tone} dot={false}>
      {t(`invoicing.payment.${key}`)}
    </StatusPill>
  );
}
