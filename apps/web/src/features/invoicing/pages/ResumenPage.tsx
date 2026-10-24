import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatEuros, isOverdue, madridToday } from '@piscinas/shared';
import { listInvoices, needingAttention, type InvoiceWithRelations } from '../lib/data.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { CircleAlert, Clock, Euro, ReceiptText, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { StatCard } from '../../../components/ui/StatCard.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { SkeletonText } from '../../../components/ui/Skeleton.js';
import { DbFailureAlert } from '../components/DbFailureAlert.js';
import { InvoicingHeader } from '../components/InvoicingHeader.js';

/**
 * Billing at a glance. Deliberately small: four numbers that answer "is anything wrong, and how
 * much money is outstanding". Everything here is derived from the invoice list, so it cannot
 * disagree with the Facturas table.
 */
export function ResumenPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [attention, setAttention] = useState<{ invoice_id: string; reason: string }[]>([]);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, att] = await Promise.all([listInvoices(), needingAttention()]);
    setInvoices(rows.data);
    setAttention(att.data);
    setFailure(rows.failure ?? att.failure);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const month = madridToday().slice(0, 7);
  const issued = invoices.filter((i) => i.status !== 'draft');
  const billedThisMonth = issued
    .filter((i) => (i.issue_date ?? '').startsWith(month))
    .reduce((n, i) => n + Number(i.total_cents), 0);
  const outstanding = issued
    .filter((i) => i.payment_status === 'pending' && i.status !== 'void')
    .reduce((n, i) => n + Number(i.total_cents), 0);
  const overdue = issued.filter(
    (i) => i.status !== 'void' && isOverdue(i.due_date, i.payment_status),
  );

  return (
    <div className="flex flex-col gap-6">
      <InvoicingHeader className="mb-0" />
      <DbFailureAlert failure={failure} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('invoicing.resumen.billedMonth')}
          value={formatEuros(billedThisMonth)}
          icon={<Euro size={16} />}
          loading={loading}
        />
        <StatCard
          label={t('invoicing.resumen.outstanding')}
          value={formatEuros(outstanding)}
          icon={<Clock size={16} />}
          loading={loading}
        />
        <StatCard
          label={t('invoicing.resumen.overdue')}
          value={String(overdue.length)}
          icon={<ReceiptText size={16} />}
          tone={overdue.length > 0 ? 'alert' : 'default'}
          loading={loading}
        />
        <StatCard
          label={t('invoicing.resumen.attention')}
          value={String(attention.length)}
          icon={<CircleAlert size={16} />}
          tone={attention.length > 0 ? 'alert' : 'default'}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader title={t('invoicing.resumen.attention')} />
        {loading ? (
          <SkeletonText />
        ) : attention.length === 0 ? (
          <EmptyState
            compact
            icon={<ShieldCheck size={20} />}
            title={t('invoicing.resumen.allClear')}
          />
        ) : (
          <ul className="flex flex-col text-sm">
            {attention.map((a) => {
              const inv = invoices.find((i) => i.id === a.invoice_id);
              return (
                <li
                  key={a.invoice_id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-0"
                >
                  <Link
                    to={`/invoices/${a.invoice_id}`}
                    className="font-medium text-text hover:text-accent"
                  >
                    {inv?.invoice_series?.code ?? ''}/{inv?.number ?? '—'} ·{' '}
                    {inv?.client?.name ?? ''}
                  </Link>
                  <StatusPill tone="red">
                    {t(`invoicing.resumen.reason.${a.reason}`, { defaultValue: a.reason })}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
