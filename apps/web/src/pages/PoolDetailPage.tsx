import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { ClipboardList, Pencil, Plus, ShieldCheck, Trash2, Waves } from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { DataTable, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import { useRecordCrumb } from '../features/app-shell/index.js';
import { PoolFormModal } from '../components/PoolFormModal.js';
import { BasinFormModal } from '../components/BasinFormModal.js';
import { TreatmentFormModal } from '../components/TreatmentFormModal.js';
import type { Tables } from '../lib/database.types.js';

type Pool = Tables<'pool'> & { client: { name: string; is_self: boolean } | null };
type Treatment = Tables<'treatment'>;
type BasinWithTreatments = Tables<'basin'> & { treatment: Treatment[] };
type PoolReport = Pick<Tables<'report'>, 'id' | 'visited_at' | 'status' | 'analysis_type'> & {
  basin: { denominacion: string } | null;
};

const TABS = ['resumen', 'vasos', 'informes', 'siloe'] as const;
type Tab = (typeof TABS)[number];

export function PoolDetailPage() {
  const { t } = useTranslation();
  const { poolId } = useParams();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const isOwnerOrg = profile?.org.type === 'owner';

  const [pool, setPool] = useState<Pool | null>(null);
  const [basins, setBasins] = useState<BasinWithTreatments[]>([]);
  const [reports, setReports] = useState<PoolReport[] | null>(null);
  // The open tab lives in the URL (?tab=vasos) so it survives reloads and can be linked.
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'resumen';
  const setTab = (next: string) =>
    setParams(next === 'resumen' ? {} : { tab: next }, { replace: true });
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

  // This pool's visits, for the Informes tab and the last-visit figure. Read-only.
  useEffect(() => {
    if (!poolId) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('report')
        .select(
          'id, visited_at, status, analysis_type, basin!report_basin_id_org_id_fkey(denominacion)',
        )
        .eq('pool_id', poolId)
        .order('visited_at', { ascending: false });
      if (active) setReports((data as PoolReport[] | null) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [poolId]);

  useRecordCrumb(pool?.denominacion);

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

  if (loading) return <PoolDetailSkeleton />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!pool || !profile) return <Alert tone="error">{t('common.genericError')}</Alert>;

  const lastVisit = reports?.[0]?.visited_at ?? null;
  const reportColumns: Column<PoolReport>[] = [
    {
      id: 'date',
      header: t('reports.visitedAt'),
      cell: (r) => (
        <time dateTime={r.visited_at}>{new Date(r.visited_at).toLocaleString('es-ES')}</time>
      ),
      sortValue: (r) => r.visited_at,
    },
    {
      id: 'basin',
      header: t('reports.basin'),
      cell: (r) => r.basin?.denominacion ?? t('common.none'),
      hideBelow: 'sm',
    },
    {
      id: 'type',
      header: t('reports.analysisType'),
      cell: (r) => t(`analysisType.${r.analysis_type}`),
      hideBelow: 'md',
    },
    {
      id: 'status',
      header: t('reports.statusFilter'),
      cell: (r) => <ReportStatusBadge status={r.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        back={{ to: '/pools', label: t('nav.pools') }}
        title={pool.denominacion}
        description={
          !isOwnerOrg && pool.client && !pool.client.is_self ? pool.client.name : undefined
        }
        badges={
          pool.siloe_cod_p ? (
            <StatusPill tone="green">{t('pools.siloeReady')}</StatusPill>
          ) : (
            <StatusPill tone="amber">{t('pools.siloeMissing')}</StatusPill>
          )
        }
        actions={
          canWrite && (
            <>
              <Button variant="secondary" onClick={() => setEditingPool(true)}>
                <Pencil aria-hidden size={16} />
                {t('common.edit')}
              </Button>
              <Button asChild>
                <Link to={`/reports/new?poolId=${pool.id}`}>
                  <Plus aria-hidden size={16} />
                  {t('reports.addReport')}
                </Link>
              </Button>
            </>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen">{t('pools.tabs.summary')}</TabsTrigger>
          <TabsTrigger value="vasos">
            {t('basins.title')}
            <Count n={basins.length} />
          </TabsTrigger>
          <TabsTrigger value="informes">
            {t('reports.title')}
            {reports && <Count n={reports.length} />}
          </TabsTrigger>
          <TabsTrigger value="siloe">SILOÉ</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Fact label={t('pools.lastVisit')}>
              {reports === null ? (
                <Skeleton className="h-6 w-28" />
              ) : lastVisit ? (
                <time dateTime={lastVisit}>{new Date(lastVisit).toLocaleDateString('es-ES')}</time>
              ) : (
                t('dashboard.neverVisited')
              )}
            </Fact>
            <Fact label={t('basins.title')}>{basins.length}</Fact>
            <Fact label={t('reports.title')}>
              {reports === null ? <Skeleton className="h-6 w-10" /> : reports.length}
            </Fact>
          </div>
          <Card>
            <CardHeader title={t('pools.details')} />
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
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
        </TabsContent>

        <TabsContent value="vasos" className="flex flex-col gap-4">
          {canWrite && basins.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={() => setBasinModal({ basin: null })}>
                <Plus aria-hidden size={16} />
                {t('basins.addBasin')}
              </Button>
            </div>
          )}
          {basins.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<Waves size={22} />}
                title={t('basins.empty')}
                description={t('pools.basinsHint')}
                action={
                  canWrite && (
                    <Button onClick={() => setBasinModal({ basin: null })}>
                      <Plus aria-hidden size={16} />
                      {t('basins.addBasin')}
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            basins.map((b) => (
              <Card key={b.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-text">{b.denominacion}</h3>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {[
                        b.clase ? t(`basinClass.${b.clase}`) : null,
                        b.capacidad_m3 != null ? `${b.capacidad_m3} m³` : null,
                        b.prof_max != null ? `${b.prof_min ?? 0}–${b.prof_max} m` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('common.none')}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t('common.edit')}: ${b.denominacion}`}
                        title={t('common.edit')}
                        onClick={() => setBasinModal({ basin: b })}
                      >
                        <Pencil aria-hidden size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t('common.delete')}: ${b.denominacion}`}
                        title={t('common.delete')}
                        onClick={() => deleteBasin(b.id)}
                      >
                        <Trash2 aria-hidden size={16} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
                      {t('treatments.title')}
                    </span>
                    {canWrite && (
                      <Button
                        variant="link"
                        size="sm"
                        type="button"
                        onClick={() => setTreatmentModal({ basinId: b.id, treatment: null })}
                      >
                        {t('treatments.addTreatment')}
                      </Button>
                    )}
                  </div>
                  {b.treatment.length === 0 ? (
                    <p className="text-sm text-text-muted">{t('treatments.empty')}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {b.treatment.map((tr) => (
                        <li
                          key={tr.id}
                          className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0"
                        >
                          <span className="text-text">
                            {t(`treatmentKind.${tr.kind}`)}
                            {tr.comercial ? ` — ${tr.comercial}` : ''}
                          </span>
                          {canWrite && (
                            <span className="flex shrink-0 gap-3">
                              <Button
                                variant="link"
                                size="sm"
                                type="button"
                                onClick={() => setTreatmentModal({ basinId: b.id, treatment: tr })}
                              >
                                {t('common.edit')}
                              </Button>
                              <Button
                                variant="link"
                                size="sm"
                                type="button"
                                className="text-text-muted"
                                onClick={() => deleteTreatment(tr.id)}
                              >
                                {t('common.delete')}
                              </Button>
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
        </TabsContent>

        <TabsContent value="informes">
          <DataTable
            caption={t('reports.title')}
            columns={reportColumns}
            rows={reports ?? []}
            getRowId={(r) => r.id}
            rowHref={(r) => `/reports/${r.id}`}
            loading={reports === null}
            empty={
              <EmptyState
                icon={<ClipboardList size={22} />}
                title={t('pools.reportsEmpty')}
                action={
                  canWrite && (
                    <Button asChild>
                      <Link to={`/reports/new?poolId=${pool.id}`}>{t('reports.addReport')}</Link>
                    </Button>
                  )
                }
              />
            }
          />
        </TabsContent>

        <TabsContent value="siloe" className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title={t('pools.siloeTitle')}
              description={t('pools.siloeHint')}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/siloe">{t('siloe.title')}</Link>
                </Button>
              }
            />
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Info label={t('pools.siloeCodP')} value={pool.siloe_cod_p} />
            </dl>
          </Card>
          {basins.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact icon={<ShieldCheck size={20} />} title={t('basins.empty')} />
            </Card>
          ) : (
            <Card padded={false}>
              <ul>
                {basins.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0 sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text">{b.denominacion}</p>
                      <p className="text-xs text-text-muted">
                        {t('pools.siloeCodV')}: {b.siloe_cod_v || t('common.none')}
                      </p>
                    </div>
                    {pool.siloe_cod_p && b.siloe_cod_v ? (
                      <StatusPill tone="green">{t('pools.siloeReady')}</StatusPill>
                    ) : (
                      <StatusPill tone="amber">{t('pools.siloeMissing')}</StatusPill>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-[var(--radius-full)] bg-surface-muted px-1.5 text-xs text-text-muted tabular-nums">
      {n}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-3 shadow-card sm:px-5 sm:py-4">
      <p className="truncate text-xs text-text-muted sm:text-sm">{label}</p>
      <div className="mt-1 font-display text-base font-semibold text-text sm:text-lg">
        {children}
      </div>
    </div>
  );
}

function PoolDetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-8 w-72 max-w-full" />
      <Skeleton className="mb-8 h-4 w-40" />
      <Skeleton className="mb-6 h-10 w-full" />
      <Card>
        <SkeletonText lines={4} />
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{value || t('common.none')}</dd>
    </div>
  );
}
