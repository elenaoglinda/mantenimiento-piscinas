import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{t('pools.title')}</h1>
          <p className="text-sm text-text-muted">{t('pools.subtitle')}</p>
        </div>
        {canWrite &&
          !loading &&
          (needsClient ? (
            <Link to="/clients">
              <Button variant="secondary">{t('pools.addClientFirst')}</Button>
            </Link>
          ) : (
            <Button onClick={() => setCreating(true)}>{t('pools.addPool')}</Button>
          ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : needsClient ? (
        <Card>
          <p className="mb-4 text-text-muted">{t('pools.needClientHint')}</p>
          <Link to="/clients">
            <Button>{t('pools.addClientFirst')}</Button>
          </Link>
        </Card>
      ) : pools.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('pools.empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pools.map((p) => (
            <Link
              key={p.id}
              to={`/pools/${p.id}`}
              className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted"
            >
              <span className="font-medium text-text">{p.denominacion}</span>
              {!isOwnerOrg && p.client && !p.client.is_self && (
                <span className="text-sm text-text-muted">{p.client.name}</span>
              )}
              {(p.localidad || p.municipio) && (
                <span className="text-sm text-text-muted">
                  {[p.localidad, p.provincia].filter(Boolean).join(', ')}
                </span>
              )}
            </Link>
          ))}
        </div>
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
