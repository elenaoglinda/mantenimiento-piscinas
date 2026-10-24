import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEuros, formatInvoiceNumber } from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../auth/context.js';
import {
  createDraft,
  listInvoices,
  needingAttention,
  type InvoiceWithRelations,
} from '../lib/data.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import { Plus, ReceiptText } from 'lucide-react';
import { Alert } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';
import { DataTable, TableToolbar, type Column } from '../../../components/ui/DataTable.js';
import { Sheet } from '../../../components/ui/Dialog.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { NativeSelect } from '../../../components/ui/Input.js';
import { TextField } from '../../../components/ui/TextField.js';
import { SelectField } from '../../../components/ui/fields.js';
import { cn, focusRing, fold } from '../../../components/ui/utils.js';
import { FiscalStateBadge, PaymentBadge } from '../components/FiscalStateBadge.js';
import { InvoicingHeader } from '../components/InvoicingHeader.js';
import { SetupChecklist } from '../components/SetupChecklist.js';
import { DbFailureAlert } from '../components/DbFailureAlert.js';
import type { Tables } from '../../../lib/database.types.js';

/**
 * Invoice history, plus the setup a new org must complete before anything can be issued.
 *
 * "Nueva factura" is always offered to writers — disabled, with the setup checklist explaining
 * why, when setup is incomplete; never hidden. Hiding it previously made the feature look absent
 * rather than blocked. The form itself opens in a side sheet.
 */
export function InvoicesPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [series, setSeries] = useState<Tables<'invoice_series'>[]>([]);
  const [clients, setClients] = useState<Pick<Tables<'client'>, 'id' | 'name'>[]>([]);
  const [fiscal, setFiscal] = useState<Tables<'billing_profile'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  const [seriesId, setSeriesId] = useState('');
  const [clientId, setClientId] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [tab, setTab] = useState<'todas' | 'rectificativas'>('todas');
  const [attention, setAttention] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, ser, cli, prof, att] = await Promise.all([
      listInvoices(),
      supabase.from('invoice_series').select('*').eq('archived', false).order('code'),
      supabase.from('client').select('id, name').eq('archived', false).order('name'),
      supabase.from('billing_profile').select('*').maybeSingle(),
      needingAttention(),
    ]);
    setInvoices(rows.data);
    setSeries(ser.data ?? []);
    setClients(cli.data ?? []);
    setFiscal(prof.data ?? null);
    setAttention(new Set(att.data.map((a) => a.invoice_id)));
    // Any one of these failing the same way means the same thing; report the first.
    setFailure(rows.failure ?? toDbFailure(ser.error) ?? toDbFailure(prof.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived, not stored: an invoice is rectificada when some rectificativa names it.
  const rectified = useMemo(
    () => new Set(invoices.map((i) => i.rectifies_invoice_id).filter(Boolean) as string[]),
    [invoices],
  );

  const years = useMemo(() => {
    const set = new Set(invoices.map((i) => (i.issue_date ?? i.created_at).slice(0, 4)));
    return [...set].sort().reverse();
  }, [invoices]);

  const visible = useMemo(
    () =>
      invoices.filter((i) => {
        const isRect = i.tipo_factura.startsWith('R');
        if (tab === 'rectificativas' ? !isRect : isRect) return false;
        if (filterStatus === 'attention' && !attention.has(i.id)) return false;
        if (filterStatus === 'draft' && i.status !== 'draft') return false;
        if (filterStatus !== 'all' && filterStatus !== 'draft' && filterStatus !== 'attention') {
          if (i.status === 'draft' || i.send_status !== filterStatus) return false;
        }
        if (filterClient !== 'all' && i.client_id !== filterClient) return false;
        if (filterYear !== 'all' && (i.issue_date ?? i.created_at).slice(0, 4) !== filterYear) {
          return false;
        }
        const q = fold(search.trim());
        if (
          q &&
          !fold(
            `${formatInvoiceNumber(i.invoice_series?.code ?? '', i.number)} ${i.client?.name ?? ''} ${i.descripcion}`,
          ).includes(q)
        ) {
          return false;
        }
        return true;
      }),
    [invoices, tab, attention, filterStatus, filterClient, filterYear, search],
  );

  async function onCreateSeries() {
    if (!profile) return;
    setBusy(true);
    setFailure(null);
    const year = new Date().getFullYear();
    const { error } = await supabase
      .from('invoice_series')
      .insert({ org_id: profile.org.id, code: String(year), description: `Serie ${year}` });
    const f = toDbFailure(error);
    if (f) setFailure(f);
    else await load();
    setBusy(false);
  }

  async function onCreateDraft() {
    if (!profile || !seriesId || !clientId || !descripcion.trim()) return;
    setBusy(true);
    setFailure(null);
    const { failure: f } = await createDraft({
      orgId: profile.org.id,
      seriesId,
      clientId,
      descripcion: descripcion.trim(),
    });
    if (f) setFailure(f);
    else {
      setDescripcion('');
      setCreating(false);
      await load();
    }
    setBusy(false);
  }

  const hasFiscal = Boolean(fiscal);
  const hasSeries = series.length > 0;
  const setupDone = hasFiscal && hasSeries;

  // Totals of what the filters show. Drafts and void invoices carry no fiscal amount.
  const counted = visible.filter((i) => i.status === 'issued');
  const sum = (k: 'base_cents' | 'tax_cents' | 'total_cents') =>
    counted.reduce((n, i) => n + Number(i[k]), 0);

  const columns: Column<InvoiceWithRelations>[] = [
    {
      id: 'number',
      header: t('invoicing.number'),
      cell: (inv) => (
        <span className="tabular-nums">
          {formatInvoiceNumber(inv.invoice_series?.code ?? '', inv.number)}
        </span>
      ),
      sortValue: (inv) => inv.number,
    },
    {
      id: 'date',
      header: t('invoicing.issueDate'),
      cell: (inv) =>
        inv.issue_date ? (
          <time dateTime={inv.issue_date}>
            {new Date(inv.issue_date).toLocaleDateString('es-ES')}
          </time>
        ) : (
          <span className="text-text-muted">{t('invoicing.status.draft')}</span>
        ),
      sortValue: (inv) => inv.issue_date,
      hideBelow: 'sm',
    },
    {
      id: 'client',
      header: t('invoicing.client'),
      cell: (inv) => (
        <span className="flex flex-col">
          <span>{inv.client?.name ?? '—'}</span>
          <span className="max-w-64 truncate text-xs text-text-muted">{inv.descripcion}</span>
        </span>
      ),
      sortValue: (inv) => inv.client?.name,
      hideBelow: 'md',
    },
    {
      id: 'total',
      header: t('invoicing.total'),
      cell: (inv) => formatEuros(Number(inv.total_cents)),
      sortValue: (inv) => Number(inv.total_cents),
      align: 'right',
    },
    {
      id: 'state',
      header: t('invoicing.state'),
      cell: (inv) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <FiscalStateBadge invoice={{ ...inv, rectified: rectified.has(inv.id) }} />
          <PaymentBadge
            paymentStatus={inv.payment_status}
            dueDate={inv.due_date}
            status={inv.status}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <InvoicingHeader
        className="mb-1"
        actions={
          canWrite && (
            <Button
              onClick={() => setCreating(true)}
              disabled={!setupDone || loading}
              title={!setupDone ? t('invoicing.newInvoiceBlocked') : undefined}
            >
              <Plus aria-hidden size={16} />
              {t('invoicing.newInvoice')}
            </Button>
          )
        }
      />

      <DbFailureAlert failure={failure} />
      <Alert tone="warning">{t('invoicing.testModeNotice')}</Alert>

      {!loading && !setupDone && (
        <SetupChecklist
          hasFiscal={hasFiscal}
          hasSeries={hasSeries}
          hasInvoice={invoices.length > 0}
          canWrite={canWrite}
          busy={busy}
          onCreateSeries={onCreateSeries}
        />
      )}

      <section className="flex flex-col">
        <TableToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder={t('invoicing.searchPlaceholder')}
        >
          <div
            role="group"
            aria-label={t('invoicing.history')}
            className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
          >
            {(['todas', 'rectificativas'] as const).map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={tab === x}
                onClick={() => setTab(x)}
                className={cn(
                  'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                  focusRing,
                  tab === x ? 'bg-accent-soft text-navy-800' : 'text-text-muted hover:text-text',
                )}
              >
                {t(`invoicing.tab.${x}`)}
              </button>
            ))}
          </div>
          {invoices.length > 0 && (
            <>
              <NativeSelect
                aria-label={t('invoicing.filterStatus')}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-9 w-auto"
              >
                <option value="all">
                  {t('invoicing.filterStatus')}: {t('invoicing.filterAll')}
                </option>
                <option value="attention">{t('invoicing.filterAttention')}</option>
                <option value="draft">{t('invoicing.status.draft')}</option>
                <option value="not_sent">{t('invoicing.sendStatus.not_sent')}</option>
                <option value="queued">{t('invoicing.sendStatus.queued')}</option>
                <option value="sending">{t('invoicing.sendStatus.sending')}</option>
                <option value="accepted">{t('invoicing.sendStatus.accepted')}</option>
                <option value="rejected">{t('invoicing.sendStatus.rejected')}</option>
                <option value="failed">{t('invoicing.sendStatus.failed')}</option>
              </NativeSelect>
              <NativeSelect
                aria-label={t('invoicing.filterClient')}
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="h-9 w-auto"
              >
                <option value="all">
                  {t('invoicing.filterClient')}: {t('invoicing.filterAll')}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('invoicing.filterYear')}
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="h-9 w-auto"
              >
                <option value="all">
                  {t('invoicing.filterYear')}: {t('invoicing.filterAll')}
                </option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            </>
          )}
        </TableToolbar>

        {counted.length > 0 && (
          <dl className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-4">
            {[
              [t('invoicing.totalsCount'), String(counted.length)],
              [t('invoicing.lineTotal'), formatEuros(sum('base_cents'))],
              [t('invoicing.taxRate'), formatEuros(sum('tax_cents'))],
              [t('invoicing.total'), formatEuros(sum('total_cents'))],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="font-display text-lg font-semibold text-text tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <DataTable
          caption={t('invoicing.history')}
          columns={columns}
          rows={visible}
          getRowId={(inv) => inv.id}
          rowHref={(inv) => `/invoices/${inv.id}`}
          loading={loading}
          empty={
            invoices.length === 0 ? (
              <EmptyState
                icon={<ReceiptText size={22} />}
                title={t('invoicing.empty')}
                description={
                  setupDone ? t('invoicing.emptyHint') : t('invoicing.newInvoiceBlocked')
                }
                action={
                  canWrite &&
                  setupDone && (
                    <Button onClick={() => setCreating(true)}>
                      <Plus aria-hidden size={16} />
                      {t('invoicing.newInvoice')}
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState
                compact
                icon={<ReceiptText size={20} />}
                title={t('invoicing.noMatches')}
              />
            )
          }
        />
      </section>

      <Sheet
        open={creating}
        onOpenChange={setCreating}
        title={t('invoicing.newInvoice')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={onCreateDraft}
              loading={busy}
              disabled={!setupDone || !seriesId || !clientId || !descripcion.trim()}
            >
              {t('invoicing.createDraft')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <DbFailureAlert failure={failure} />
          <SelectField
            label={t('invoicing.series')}
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            disabled={!setupDone}
          >
            <option value="">—</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('invoicing.client')}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={!setupDone}
          >
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('invoicing.descripcion')}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={t('invoicing.descripcionPlaceholder')}
            disabled={!setupDone}
          />
          <p className="text-xs text-text-muted">{t('invoicing.draftHint')}</p>
        </div>
      </Sheet>
    </div>
  );
}
