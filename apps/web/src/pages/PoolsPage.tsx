import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Waves } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { DataTable, TableToolbar, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { fold } from '../components/ui/utils.js';
import { PoolFormModal } from '../components/PoolFormModal.js';
import type { Tables } from '../lib/database.types.js';

type PoolRow = Tables<'pool'> & { client: { name: string; is_self: boolean } | null };

export function PoolsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const isOwnerOrg = profile?.org.type === 'owner';

  const [pools, setPools] = useState<PoolRow[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from('pool')
        .select('*, client!pool_client_id_org_id_fkey(name, is_self)')
        .eq('archived', false)
        .order('denominacion'),
      supabase.from('client').select('id', { count: 'exact', head: true }).eq('archived', false),
    ]);
    if (error) setError(t('common.genericError'));
    else setPools((data as PoolRow[]) ?? []);
    setClientCount(count ?? 0);
    setLoading(false);
  }, [t]);

  const needsClient = isOwnerOrg === false && clientCount === 0;

  useEffect(() => {
    void load();
  }, [load]);

  const showClient = (p: PoolRow) => !isOwnerOrg && p.client && !p.client.is_self;
  const place = (p: PoolRow) =>
    [p.localidad ?? p.municipio, p.provincia].filter(Boolean).join(', ');

  const rows = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return pools;
    return pools.filter((p) =>
      fold([p.denominacion, showClient(p) ? p.client?.name : '', place(p)].join(' ')).includes(q),
    );
    // showClient/place only depend on isOwnerOrg, which is stable per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools, query]);

  const columns: Column<PoolRow>[] = [
    {
      id: 'name',
      header: t('reports.pool'),
      cell: (p) => (
        <span className="flex flex-col">
          <span>{p.denominacion}</span>
          {/* On phones the client column is hidden; show it under the name instead. */}
          {showClient(p) && (
            <span className="text-xs font-normal text-text-muted md:hidden">{p.client?.name}</span>
          )}
        </span>
      ),
      sortValue: (p) => p.denominacion,
    },
    ...(isOwnerOrg
      ? []
      : [
          {
            id: 'client',
            header: t('pools.client'),
            cell: (p: PoolRow) => (showClient(p) ? p.client?.name : t('common.none')),
            sortValue: (p: PoolRow) => (showClient(p) ? (p.client?.name ?? null) : null),
            hideBelow: 'md' as const,
          },
        ]),
    {
      id: 'place',
      header: t('pools.location'),
      cell: (p) => place(p) || t('common.none'),
      sortValue: (p) => place(p) || null,
      hideBelow: 'lg',
    },
    {
      id: 'type',
      header: t('pools.poolType'),
      cell: (p) => (p.pool_type ? t(`poolType.${p.pool_type}`) : t('common.none')),
      sortValue: (p) => p.pool_type,
      hideBelow: 'lg',
    },
    {
      id: 'siloe',
      header: 'SILOÉ',
      cell: (p) =>
        p.siloe_cod_p ? (
          <StatusPill tone="green">{t('pools.siloeReady')}</StatusPill>
        ) : (
          <StatusPill tone="amber">{t('pools.siloeMissing')}</StatusPill>
        ),
      sortValue: (p) => (p.siloe_cod_p ? 1 : 0),
      hideBelow: 'sm',
    },
  ];

  const addButton =
    canWrite &&
    (needsClient ? (
      <Button asChild variant="secondary">
        <Link to="/clients">{t('pools.addClientFirst')}</Link>
      </Button>
    ) : (
      <Button onClick={() => setCreating(true)}>
        <Plus aria-hidden size={16} />
        {t('pools.addPool')}
      </Button>
    ));

  return (
    <div>
      <PageHeader
        title={t('pools.title')}
        description={t('pools.subtitle')}
        actions={!loading && addButton}
      />

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : !loading && needsClient ? (
        <Card padded={false}>
          <EmptyState
            icon={<Users size={22} />}
            title={t('pools.addClientFirst')}
            description={t('pools.needClientHint')}
            action={
              canWrite && (
                <Button asChild>
                  <Link to="/clients">{t('pools.addClientFirst')}</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {(loading || pools.length > 0) && (
            <TableToolbar
              search={query}
              onSearch={setQuery}
              searchPlaceholder={t('pools.searchPlaceholder')}
            />
          )}
          <DataTable
            caption={t('pools.title')}
            columns={columns}
            rows={rows}
            getRowId={(p) => p.id}
            rowHref={(p) => `/pools/${p.id}`}
            loading={loading}
            empty={
              pools.length === 0 ? (
                <EmptyState
                  icon={<Waves size={22} />}
                  title={t('pools.emptyTitle')}
                  description={t('pools.emptyHint')}
                  action={
                    canWrite && (
                      <Button onClick={() => setCreating(true)}>
                        <Plus aria-hidden size={16} />
                        {t('pools.addPool')}
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState
                  compact
                  icon={<Waves size={20} />}
                  title={t('pools.noMatches')}
                  description={t('pools.noMatchesHint')}
                />
              )
            }
          />
        </>
      )}

      {creating && profile && (
        <PoolFormModal
          pool={null}
          orgId={profile.org.id}
          isOwnerOrg={!!isOwnerOrg}
          onClose={() => setCreating(false)}
          onSaved={(poolId) => {
            setCreating(false);
            navigate(`/pools/${poolId}`);
          }}
        />
      )}
    </div>
  );
}
