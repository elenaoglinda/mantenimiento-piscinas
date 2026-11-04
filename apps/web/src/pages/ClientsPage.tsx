import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ClientFormModal, type Client } from '../components/ClientFormModal.js';

export function ClientsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [clients, setClients] = useState<Client[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            // A row opens the client's page (history, pools, contact); "Editar" is there.
            rowHref={(c) => `/clients/${c.id}`}
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

      {creating && (
        <ClientFormModal
          client={null}
          orgId={profile!.org.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
