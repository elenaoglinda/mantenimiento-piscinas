import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatEuros, formatInvoiceNumber } from '@piscinas/shared';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../auth/context.js';
import { createDraft, listInvoices, type InvoiceWithRelations } from '../lib/data.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import { Alert, Card, Spinner } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';
import { TextField } from '../../../components/ui/TextField.js';
import { SelectField } from '../../../components/ui/fields.js';
import { SendStatusBadge } from '../components/SendStatusBadge.js';
import { SetupChecklist } from '../components/SetupChecklist.js';
import { DbFailureAlert } from '../components/DbFailureAlert.js';
import type { Tables } from '../../../lib/database.types.js';

/**
 * Invoice history, plus the setup a new org must complete before anything can be issued.
 *
 * The create form is always rendered — disabled with a reason when setup is incomplete, never
 * hidden. Hiding it previously made the feature look absent rather than blocked.
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

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, ser, cli, prof] = await Promise.all([
      listInvoices(),
      supabase.from('invoice_series').select('*').eq('archived', false).order('code'),
      supabase.from('client').select('id, name').eq('archived', false).order('name'),
      supabase.from('billing_profile').select('*').maybeSingle(),
    ]);
    setInvoices(rows.data);
    setSeries(ser.data ?? []);
    setClients(cli.data ?? []);
    setFiscal(prof.data ?? null);
    // Any one of these failing the same way means the same thing; report the first.
    setFailure(rows.failure ?? toDbFailure(ser.error) ?? toDbFailure(prof.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const set = new Set(invoices.map((i) => (i.issue_date ?? i.created_at).slice(0, 4)));
    return [...set].sort().reverse();
  }, [invoices]);

  const visible = useMemo(
    () =>
      invoices.filter((i) => {
        if (filterStatus === 'draft' && i.status !== 'draft') return false;
        if (filterStatus !== 'all' && filterStatus !== 'draft') {
          if (i.status === 'draft' || i.send_status !== filterStatus) return false;
        }
        if (filterClient !== 'all' && i.client_id !== filterClient) return false;
        if (filterYear !== 'all' && (i.issue_date ?? i.created_at).slice(0, 4) !== filterYear) {
          return false;
        }
        return true;
      }),
    [invoices, filterStatus, filterClient, filterYear],
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
      await load();
    }
    setBusy(false);
  }

  if (loading) return <Spinner />;

  const hasFiscal = Boolean(fiscal);
  const hasSeries = series.length > 0;
  const setupDone = hasFiscal && hasSeries;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('invoicing.title')}</h1>
        <p className="text-sm text-text-muted">{t('invoicing.subtitle')}</p>
      </div>

      <DbFailureAlert failure={failure} />
      <Alert tone="info">{t('invoicing.testModeNotice')}</Alert>

      {!setupDone && (
        <SetupChecklist
          hasFiscal={hasFiscal}
          hasSeries={hasSeries}
          hasInvoice={invoices.length > 0}
          canWrite={canWrite}
          busy={busy}
          onCreateSeries={onCreateSeries}
        />
      )}

      {canWrite && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.newInvoice')}</h2>
          {!setupDone && (
            <p className="mb-3 text-sm text-text-muted">{t('invoicing.newInvoiceBlocked')}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>
          <div className="mt-3">
            <Button
              onClick={onCreateDraft}
              loading={busy}
              disabled={!setupDone || !seriesId || !clientId || !descripcion.trim()}
            >
              {t('invoicing.createDraft')}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">{t('invoicing.history')}</h2>
          <Link to="/invoices/settings" className="text-sm text-primary hover:underline">
            {t('invoicing.editFiscal')}
          </Link>
        </div>

        {invoices.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <SelectField
              label={t('invoicing.filterStatus')}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">{t('invoicing.filterAll')}</option>
              <option value="draft">{t('invoicing.status.draft')}</option>
              <option value="not_sent">{t('invoicing.sendStatus.not_sent')}</option>
              <option value="queued">{t('invoicing.sendStatus.queued')}</option>
              <option value="sending">{t('invoicing.sendStatus.sending')}</option>
              <option value="accepted">{t('invoicing.sendStatus.accepted')}</option>
              <option value="rejected">{t('invoicing.sendStatus.rejected')}</option>
              <option value="failed">{t('invoicing.sendStatus.failed')}</option>
            </SelectField>
            <SelectField
              label={t('invoicing.filterClient')}
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
            >
              <option value="all">{t('invoicing.filterAll')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('invoicing.filterYear')}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">{t('invoicing.filterAll')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>
          </div>
        )}

        {invoices.length === 0 ? (
          <p className="text-text-muted">{t('invoicing.empty')}</p>
        ) : visible.length === 0 ? (
          <p className="text-text-muted">{t('invoicing.noMatches')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1 pr-3 font-medium">{t('invoicing.number')}</th>
                  <th className="py-1 pr-3 font-medium">{t('invoicing.issueDate')}</th>
                  <th className="py-1 pr-3 font-medium">{t('invoicing.client')}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t('invoicing.total')}</th>
                  <th className="py-1 pr-3 font-medium">{t('invoicing.state')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <Link to={`/invoices/${inv.id}`} className="text-primary hover:underline">
                        {formatInvoiceNumber(inv.invoice_series?.code ?? '', inv.number)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-text-muted">
                      {inv.issue_date
                        ? new Date(inv.issue_date).toLocaleDateString('es-ES')
                        : t('invoicing.status.draft')}
                    </td>
                    <td className="py-2 pr-3 text-text">{inv.client?.name ?? '—'}</td>
                    <td className="py-2 pr-3 text-right text-text">
                      {formatEuros(Number(inv.total_cents))}
                    </td>
                    <td className="py-2 pr-3">
                      <SendStatusBadge status={inv.status} sendStatus={inv.send_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
