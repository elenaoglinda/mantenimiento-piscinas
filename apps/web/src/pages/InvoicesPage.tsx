import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatEuros, formatInvoiceNumber } from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { createDraft, listInvoices, type InvoiceWithRelations } from '../lib/invoicing.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { SelectField } from '../components/ui/fields.js';
import { SendStatusBadge } from '../components/invoicing/SendStatusBadge.js';
import type { Tables } from '../lib/database.types.js';

/**
 * Invoice list plus the two things that must exist before anything can be issued: the org's
 * fiscal identity and at least one series. Both are surfaced here rather than hidden in
 * settings, because issue_invoice() refuses without them and a silent refusal is unhelpful.
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
  const [error, setError] = useState<string | null>(null);

  const [seriesId, setSeriesId] = useState('');
  const [clientId, setClientId] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, ser, cli, prof] = await Promise.all([
      listInvoices(),
      supabase.from('invoice_series').select('*').eq('archived', false).order('code'),
      supabase.from('client').select('id, name').eq('archived', false).order('name'),
      supabase.from('billing_profile').select('*').maybeSingle(),
    ]);
    setInvoices(rows);
    setSeries(ser.data ?? []);
    setClients(cli.data ?? []);
    setFiscal(prof.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateSeries() {
    if (!profile) return;
    setBusy(true);
    const year = new Date().getFullYear();
    await supabase
      .from('invoice_series')
      .insert({ org_id: profile.org.id, code: String(year), description: `Serie ${year}` });
    await load();
    setBusy(false);
  }

  async function onCreateDraft() {
    if (!profile || !seriesId || !clientId || !descripcion.trim()) return;
    setBusy(true);
    setError(null);
    const id = await createDraft({
      orgId: profile.org.id,
      seriesId,
      clientId,
      descripcion: descripcion.trim(),
    });
    if (!id) setError(t('invoicing.createFailed'));
    setDescripcion('');
    await load();
    setBusy(false);
  }

  if (loading) return <Spinner />;

  const setupNeeded = !fiscal || series.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('invoicing.title')}</h1>
        <p className="text-sm text-text-muted">{t('invoicing.subtitle')}</p>
      </div>

      <Alert tone="info">{t('invoicing.testModeNotice')}</Alert>

      {setupNeeded && canWrite && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-text">{t('invoicing.setupTitle')}</h2>
          <ul className="mb-3 flex flex-col gap-1 text-sm text-text-muted">
            {!fiscal && <li>· {t('invoicing.setupNeedFiscal')}</li>}
            {series.length === 0 && <li>· {t('invoicing.setupNeedSeries')}</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link to="/invoices/settings">
              <Button variant="secondary">{t('invoicing.editFiscal')}</Button>
            </Link>
            {series.length === 0 && (
              <Button onClick={onCreateSeries} loading={busy}>
                {t('invoicing.createSeries')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {canWrite && !setupNeeded && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-text">{t('invoicing.newInvoice')}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label={t('invoicing.series')}
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
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
            />
          </div>
          <div className="mt-3">
            <Button
              onClick={onCreateDraft}
              loading={busy}
              disabled={!seriesId || !clientId || !descripcion.trim()}
            >
              {t('invoicing.createDraft')}
            </Button>
          </div>
          {error && (
            <div className="mt-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
        </Card>
      )}

      {invoices.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('invoicing.empty')}</p>
        </Card>
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  to={`/invoices/${inv.id}`}
                  className="flex flex-col gap-1 py-3 transition-colors hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-text">
                      {formatInvoiceNumber(inv.invoice_series?.code ?? '', inv.number)} ·{' '}
                      {inv.client?.name ?? '—'}
                    </span>
                    <span className="truncate text-sm text-text-muted">{inv.descripcion}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-text">
                      {formatEuros(Number(inv.total_cents))}
                    </span>
                    <SendStatusBadge status={inv.status} sendStatus={inv.send_status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
