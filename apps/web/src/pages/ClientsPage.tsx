import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { TextareaField } from '../components/ui/fields.js';
import { Modal } from '../components/ui/Modal.js';
import type { Tables } from '../lib/database.types.js';

type Client = Tables<'client'>;

export function ClientsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [clients, setClients] = useState<Client[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rows, error: e1 }, { data: pools }] = await Promise.all([
      supabase.from('client').select('*').eq('archived', false).order('name'),
      supabase.from('pool').select('client_id').eq('archived', false),
    ]);
    if (e1) setError(t('common.genericError'));
    else setClients(rows ?? []);
    const tally: Record<string, number> = {};
    for (const p of pools ?? []) tally[p.client_id] = (tally[p.client_id] ?? 0) + 1;
    setCounts(tally);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{t('clients.title')}</h1>
          <p className="text-sm text-text-muted">{t('clients.subtitle')}</p>
        </div>
        {canWrite && <Button onClick={() => setCreating(true)}>{t('clients.addClient')}</Button>}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : clients.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('clients.empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => canWrite && setEditing(c)}
              className="flex flex-col items-start gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-muted"
            >
              <span className="font-medium text-text">{c.name}</span>
              {c.is_self && <span className="text-xs text-primary">{t('clients.self')}</span>}
              {c.cif_nif && <span className="text-sm text-text-muted">{c.cif_nif}</span>}
              <span className="text-sm text-text-muted">
                {t('clients.poolsCount', { count: counts[c.id] ?? 0 })}
              </span>
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ClientFormModal
          client={editing}
          orgId={profile!.org.id}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ClientFormModal({
  client,
  orgId,
  onClose,
  onSaved,
}: {
  client: Client | null;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(client?.name ?? '');
  const [cifNif, setCifNif] = useState(client?.cif_nif ?? '');
  const [email, setEmail] = useState(client?.contact_email ?? '');
  const [phone, setPhone] = useState(client?.contact_phone ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      cif_nif: cifNif.trim() || null,
      contact_email: email.trim() || null,
      contact_phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = client
      ? await supabase.from('client').update(payload).eq('id', client.id)
      : await supabase.from('client').insert({ ...payload, org_id: orgId });
    setSaving(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={client ? t('clients.editClient') : t('clients.addClient')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label={t('clients.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label={t('clients.cifNif')}
          value={cifNif}
          onChange={(e) => setCifNif(e.target.value)}
        />
        <TextField
          label={t('clients.contactEmail')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('clients.contactPhone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextareaField
          label={t('clients.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
