import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { PoolFormModal } from '../components/PoolFormModal.js';
import { BasinFormModal } from '../components/BasinFormModal.js';
import { TreatmentFormModal } from '../components/TreatmentFormModal.js';
import type { Tables } from '../lib/database.types.js';

type Pool = Tables<'pool'> & { client: { name: string; is_self: boolean } | null };
type Treatment = Tables<'treatment'>;
type BasinWithTreatments = Tables<'basin'> & { treatment: Treatment[] };

export function PoolDetailPage() {
  const { t } = useTranslation();
  const { poolId } = useParams();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const isOwnerOrg = profile?.org.type === 'owner';

  const [pool, setPool] = useState<Pool | null>(null);
  const [basins, setBasins] = useState<BasinWithTreatments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPool, setEditingPool] = useState(false);
  const [basinModal, setBasinModal] = useState<{ basin: Tables<'basin'> | null } | null>(null);
  const [treatmentModal, setTreatmentModal] = useState<{
    basinId: string;
    treatment: Treatment | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    const [{ data: poolData, error: e1 }, { data: basinData, error: e2 }] = await Promise.all([
      supabase
        .from('pool')
        .select('*, client!pool_client_id_org_id_fkey(name, is_self)')
        .eq('id', poolId)
        .maybeSingle(),
      supabase
        .from('basin')
        .select('*, treatment(*)')
        .eq('pool_id', poolId)
        .order('num_orden', { nullsFirst: true })
        .order('created_at'),
    ]);
    if (e1 || e2) setError(t('common.genericError'));
    else {
      setPool((poolData as Pool) ?? null);
      setBasins((basinData as BasinWithTreatments[]) ?? []);
    }
    setLoading(false);
  }, [poolId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteBasin(id: string) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await supabase.from('basin').delete().eq('id', id);
    void load();
  }

  async function deleteTreatment(id: string) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await supabase.from('treatment').delete().eq('id', id);
    void load();
  }

  if (loading) return <Spinner />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!pool || !profile) return <Alert tone="error">{t('common.genericError')}</Alert>;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/pools" className="text-sm text-primary hover:underline">
          ← {t('nav.pools')}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{pool.denominacion}</h1>
          {!isOwnerOrg && pool.client && !pool.client.is_self && (
            <p className="text-sm text-text-muted">{pool.client.name}</p>
          )}
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => setEditingPool(true)}>
            {t('common.edit')}
          </Button>
        )}
      </div>

      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Info
            label={t('pools.poolType')}
            value={pool.pool_type ? t(`poolType.${pool.pool_type}`) : null}
          />
          <Info
            label={t('pools.address')}
            value={[pool.direccion, pool.cp, pool.localidad, pool.provincia]
              .filter(Boolean)
              .join(', ')}
          />
          <Info label={t('pools.ccaa')} value={pool.ccaa} />
          <Info
            label={t('pools.waterSource')}
            value={
              pool.agua_alimentacion.length
                ? pool.agua_alimentacion.map((w) => t(`waterSource.${w}`)).join(', ')
                : null
            }
          />
          <Info
            label={t('pools.coordinates')}
            value={pool.lat != null && pool.lng != null ? `${pool.lat}, ${pool.lng}` : null}
          />
          <Info label={t('pools.siloeCodP')} value={pool.siloe_cod_p} />
        </dl>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">
          {t('basins.title')} ({basins.length})
        </h2>
        {canWrite && (
          <Button onClick={() => setBasinModal({ basin: null })}>{t('basins.addBasin')}</Button>
        )}
      </div>

      {basins.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('basins.empty')}</p>
        </Card>
      ) : (
        basins.map((b) => (
          <Card key={b.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-text">{b.denominacion}</h3>
                <p className="text-sm text-text-muted">
                  {[
                    b.clase ? t(`basinClass.${b.clase}`) : null,
                    b.capacidad_m3 != null ? `${b.capacidad_m3} m³` : null,
                    b.prof_max != null ? `${b.prof_min ?? 0}–${b.prof_max} m` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => setBasinModal({ basin: b })}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" onClick={() => deleteBasin(b.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-text-muted">{t('treatments.title')}</span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setTreatmentModal({ basinId: b.id, treatment: null })}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {t('treatments.addTreatment')}
                  </button>
                )}
              </div>
              {b.treatment.length === 0 ? (
                <p className="text-sm text-text-muted">{t('treatments.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {b.treatment.map((tr) => (
                    <li key={tr.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-text">
                        {t(`treatmentKind.${tr.kind}`)}
                        {tr.comercial ? ` — ${tr.comercial}` : ''}
                      </span>
                      {canWrite && (
                        <span className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => setTreatmentModal({ basinId: b.id, treatment: tr })}
                            className="text-primary hover:underline"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTreatment(tr.id)}
                            className="text-text-muted hover:text-text"
                          >
                            {t('common.delete')}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        ))
      )}

      {editingPool && (
        <PoolFormModal
          pool={pool}
          orgId={profile.org.id}
          isOwnerOrg={!!isOwnerOrg}
          onClose={() => setEditingPool(false)}
          onSaved={() => {
            setEditingPool(false);
            void load();
          }}
        />
      )}
      {basinModal && (
        <BasinFormModal
          basin={basinModal.basin}
          poolId={pool.id}
          orgId={profile.org.id}
          onClose={() => setBasinModal(null)}
          onSaved={() => {
            setBasinModal(null);
            void load();
          }}
        />
      )}
      {treatmentModal && (
        <TreatmentFormModal
          treatment={treatmentModal.treatment}
          basinId={treatmentModal.basinId}
          orgId={profile.org.id}
          onClose={() => setTreatmentModal(null)}
          onSaved={() => {
            setTreatmentModal(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text">{value || t('common.none')}</dd>
    </div>
  );
}
