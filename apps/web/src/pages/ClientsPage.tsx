import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Plus, Users } from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { DataTable, TableToolbar, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { fold } from '../components/ui/utils.js';
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
  // ⌘K can deep-link a search here with ?q=, also while this page is already open.
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  useEffect(() => {
    const q = params.get('q');
    if (q !== null) setQuery(q);
  }, [params]);

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

  const rows = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return clients;
    return clients.filter((c) =>
      fold(
        [c.name, c.cif_nif, c.contact_email, c.contact_phone].filter(Boolean).join(' '),
      ).includes(q),
    );
  }, [clients, query]);

  const columns: Column<Client>[] = [
    {
      id: 'name',
      header: t('clients.name'),
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          {c.name}
          {c.is_self && (
            <StatusPill tone="info" dot={false}>
              {t('clients.self')}
            </StatusPill>
          )}
        </span>
      ),
      sortValue: (c) => c.name,
    },
    {
      id: 'nif',
      header: t('clients.cifNif'),
      cell: (c) => c.cif_nif ?? t('common.none'),
      sortValue: (c) => c.cif_nif,
      hideBelow: 'md',
    },
    {
      id: 'contact',
      header: t('clients.contact'),
      cell: (c) =>
        c.contact_email || c.contact_phone ? (
          <span className="flex flex-col text-sm">
            {c.contact_email && <span>{c.contact_email}</span>}
            {c.contact_phone && <span className="text-text-muted">{c.contact_phone}</span>}
          </span>
        ) : (
          t('common.none')
        ),
      hideBelow: 'lg',
    },
    {
      id: 'pools',
      header: t('nav.pools'),
      cell: (c) => t('clients.poolsCount', { count: counts[c.id] ?? 0 }),
      sortValue: (c) => counts[c.id] ?? 0,
      align: 'right',
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('clients.title')}
        description={t('clients.subtitle')}
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden size={16} />
              {t('clients.addClient')}
            </Button>
          )
        }
      />

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <>
          {(loading || clients.length > 0) && (
            <TableToolbar
              search={query}
              onSearch={setQuery}
              searchPlaceholder={t('clients.searchPlaceholder')}
            />
          )}
          <DataTable
            caption={t('clients.title')}
            columns={columns}
            rows={rows}
            getRowId={(c) => c.id}
            onRowClick={canWrite ? (c) => setEditing(c) : undefined}
            loading={loading}
            empty={
              clients.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title={t('clients.emptyTitle')}
                  description={t('clients.emptyHint')}
                  action={
                    canWrite && (
                      <Button onClick={() => setCreating(true)}>
                        <Plus aria-hidden size={16} />
                        {t('clients.addClient')}
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState compact icon={<Users size={20} />} title={t('clients.noMatches')} />
              )
            }
          />
        </>
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
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={client ? t('clients.editClient') : t('clients.addClient')}
    >
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
