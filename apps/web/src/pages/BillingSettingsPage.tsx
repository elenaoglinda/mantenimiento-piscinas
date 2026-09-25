import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidNif } from '@piscinas/shared';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';

/**
 * The org's own fiscal identity — the "obligado tributario" whose NIF appears on every invoice
 * and under which records reach AEAT. issue_invoice() refuses to allocate a number until this
 * exists, so it is the first thing a new org fills in.
 */
export function BillingSettingsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role === 'admin' : false;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nif: '',
    razon_social: '',
    direccion: '',
    cp: '',
    municipio: '',
    provincia: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('billing_profile').select('*').maybeSingle();
    if (data) {
      setId(data.id);
      setForm({
        nif: data.nif,
        razon_social: data.razon_social,
        direccion: data.direccion ?? '',
        cp: data.cp ?? '',
        municipio: data.municipio ?? '',
        provincia: data.provincia ?? '',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nifTouched = form.nif.trim().length > 0;
  const nifInvalid = nifTouched && !isValidNif(form.nif);
  const canSave = !nifInvalid && nifTouched && form.razon_social.trim().length > 0;

  async function onSave() {
    if (!profile || !canSave) return;
    setBusy(true);
    setSaved(false);
    const payload = {
      org_id: profile.org.id,
      nif: form.nif.trim().toUpperCase(),
      razon_social: form.razon_social.trim(),
      direccion: form.direccion.trim() || null,
      cp: form.cp.trim() || null,
      municipio: form.municipio.trim() || null,
      provincia: form.provincia.trim() || null,
    };
    if (id) await supabase.from('billing_profile').update(payload).eq('id', id);
    else await supabase.from('billing_profile').insert(payload);
    await load();
    setSaved(true);
    setBusy(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('invoicing.fiscalTitle')}</h1>
        <p className="text-sm text-text-muted">{t('invoicing.fiscalSubtitle')}</p>
      </div>

      {!canWrite && <Alert tone="info">{t('invoicing.fiscalAdminOnly')}</Alert>}
      {saved && <Alert tone="success">{t('invoicing.fiscalSaved')}</Alert>}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('invoicing.nif')}
            value={form.nif}
            onChange={(e) => setForm({ ...form, nif: e.target.value })}
            disabled={!canWrite}
            error={nifInvalid ? t('invoicing.nifInvalid') : undefined}
          />
          <TextField
            label={t('invoicing.razonSocial')}
            value={form.razon_social}
            onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
            disabled={!canWrite}
          />
          <TextField
            label={t('invoicing.direccion')}
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            disabled={!canWrite}
          />
          <TextField
            label={t('invoicing.cp')}
            value={form.cp}
            onChange={(e) => setForm({ ...form, cp: e.target.value })}
            disabled={!canWrite}
          />
          <TextField
            label={t('invoicing.municipio')}
            value={form.municipio}
            onChange={(e) => setForm({ ...form, municipio: e.target.value })}
            disabled={!canWrite}
          />
          <TextField
            label={t('invoicing.provincia')}
            value={form.provincia}
            onChange={(e) => setForm({ ...form, provincia: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        {canWrite && (
          <div className="mt-4">
            <Button onClick={onSave} loading={busy} disabled={!canSave}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
