import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pencil, ShieldCheck, TriangleAlert, Waves } from 'lucide-react';
import { daysSince, latestStateByBasin, worstStatus, type ParameterStatus } from '@piscinas/shared';
import { useAuth } from '../../../auth/context.js';
import { Alert } from '../../../components/ui/feedback.js';
import { Button } from '../../../components/ui/Button.js';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { Skeleton, SkeletonText } from '../../../components/ui/Skeleton.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import { ClientFormModal, type Client } from '../../../components/ClientFormModal.js';
import { useRecordCrumb } from '../../app-shell/index.js';
import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';
import { poolRegion } from '../../../lib/parameters.js';
import { VisitHistory } from '../components/VisitHistory.js';
import { FailureAlert } from '../components/FailureAlert.js';
import { fetchRecentActivity, type RecentActivity } from '../lib/data.js';
import { formatDate, formatDaysAgo } from '../lib/format.js';
import { historyLink } from '../lib/links.js';
import { useParamCatalog } from '../lib/useParamCatalog.js';

interface ClientPool {
  id: string;
  denominacion: string;
  ccaa: string | null;
  /** Absent before the pool_ccaa_code migration. */
  ccaa_code?: string | null;
  municipio: string | null;
  localidad: string | null;
  archived: boolean;
  basin: { id: string; denominacion: string }[] | null;
}

/**
 * The client's page: contact details (with "Editar"), their pools with the last visit and the
 * current traffic light, open incidents, and one timeline of every visit across all their
 * pools. Clicking a client in Clientes opens it; ⌘K finds it.
 */
export function ClientDetailPage() {
  const { t } = useTranslation();
  const { clientId } = useParams();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const { catalog, failure: catalogFailure } = useParamCatalog();

  const [client, setClient] = useState<Client | null>(null);
  const [pools, setPools] = useState<ClientPool[] | null>(null);
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    const [c, p] = await Promise.all([
      supabase.from('client').select('*').eq('id', clientId).maybeSingle(),
      supabase
        .from('pool')
        .select(
          // `*` so ccaa_code comes along once its migration has run.
          '*, basin!basin_pool_id_org_id_fkey(id, denominacion)',
        )
        .eq('client_id', clientId)
        .order('denominacion'),
    ]);
    setFailure(toDbFailure(c.error) ?? toDbFailure(p.error));
    setClient(c.data ?? null);
    setPools((p.data ?? []) as unknown as ClientPool[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRecordCrumb(client?.name);

  const poolIds = useMemo(() => (pools ?? []).map((p) => p.id), [pools]);
  useEffect(() => {
    if (!catalog || pools === null) return;
    let active = true;
    void fetchRecentActivity(poolIds, catalog).then((r) => {
      if (!active) return;
      setActivity(r.data);
      if (r.failure) setFailure(r.failure);
    });
    return () => {
      active = false;
    };
  }, [catalog, pools, poolIds]);

  // Current light per pool: the worst latest value across its vasos.
  const poolStatus = useMemo(() => {
    const out = new Map<string, ParameterStatus>();
    if (!catalog || !activity || !pools) return out;
    for (const p of pools) {
      const states = latestStateByBasin(
        activity.readings.filter((r) => r.poolId === p.id),
        catalog.evaluatorDefs(poolRegion(p)),
      );
      out.set(p.id, worstStatus([...states.values()].map((s) => s.status)));
    }
    return out;
  }, [catalog, activity, pools]);

  if (loading) return <ClientSkeleton />;
  if (failure && !client) return <FailureAlert failure={failure} />;
  if (!client || !profile) return <Alert tone="error">{t('history.client.notFound')}</Alert>;

  const basinName = new Map(
    (pools ?? []).flatMap((p) => (p.basin ?? []).map((b) => [b.id, b.denominacion] as const)),
  );
  const poolName = new Map((pools ?? []).map((p) => [p.id, p.denominacion]));
  const activePools = (pools ?? []).filter((p) => !p.archived);
  const incidents = activity?.openIncidents ?? null;
  const address = [
    client.billing_direccion,
    client.billing_cp,
    client.billing_municipio,
    client.billing_provincia,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        back={{ to: '/clients', label: t('nav.clients') }}
        title={client.name}
        description={client.cif_nif ?? undefined}
        badges={
          client.is_self ? (
            <StatusPill tone="info" dot={false}>
              {t('clients.self')}
            </StatusPill>
          ) : undefined
        }
        actions={
          canWrite && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden size={16} />
              {t('common.edit')}
            </Button>
          )
        }
      />

      <FailureAlert failure={failure ?? catalogFailure} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t('history.client.contact')} />
          <dl className="grid gap-y-4 text-sm">
            <Info label={t('clients.contactEmail')}>
              {client.contact_email && (
                <a
                  href={`mailto:${client.contact_email}`}
                  className="break-all text-accent underline-offset-4 hover:underline"
                >
                  {client.contact_email}
                </a>
              )}
            </Info>
            <Info label={t('clients.contactPhone')}>
              {client.contact_phone && (
                <a
                  href={`tel:${client.contact_phone.replace(/\s/g, '')}`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {client.contact_phone}
                </a>
              )}
            </Info>
            <Info label={t('clients.cifNif')}>{client.cif_nif}</Info>
            <Info label={t('history.client.billingAddress')}>{address || null}</Info>
            {client.notes && (
              <Info label={t('clients.notes')}>
                <span className="whitespace-pre-line">{client.notes}</span>
              </Info>
            )}
          </dl>
        </Card>

        <Card padded={false} className="lg:col-span-2">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <CardHeader
              className="mb-2"
              title={t('history.client.pools')}
              description={t('clients.poolsCount', { count: activePools.length })}
            />
          </div>
          {activePools.length === 0 ? (
            <EmptyState
              compact
              icon={<Waves size={20} />}
              title={t('history.client.noPools')}
              action={
                canWrite && (
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/pools">{t('pools.addPool')}</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul>
              {activePools.map((p) => {
                const last = activity?.lastVisitByPool.get(p.id) ?? null;
                const status = poolStatus.get(p.id);
                const open = incidents?.filter((i) => i.poolId === p.id).length ?? 0;
                return (
                  <li key={p.id} className="border-t border-border">
                    <Link
                      to={`/pools/${p.id}`}
                      className={cn(
                        'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted/60 sm:px-6',
                        focusRing,
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-text">{p.denominacion}</span>
                        <span className="block text-sm text-text-muted">
                          {activity === null ? (
                            t('common.loading')
                          ) : last ? (
                            <>
                              {t('history.state.lastVisit')}{' '}
                              <time dateTime={last}>{formatDate(last)}</time> ·{' '}
                              {formatDaysAgo(t, daysSince(last))}
                            </>
                          ) : (
                            t('dashboard.neverVisited')
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                        {open > 0 && (
                          <StatusPill tone="red" dot={false}>
                            <TriangleAlert aria-hidden size={12} />
                            {t('history.state.openIncidents', { count: open })}
                          </StatusPill>
                        )}
                        {status && status !== 'unknown' ? (
                          <StatusPill tone={status}>
                            {t(`history.state.overall.${status}`)}
                          </StatusPill>
                        ) : activity !== null ? (
                          <StatusPill tone="unknown">
                            {t('history.state.overall.unknown')}
                          </StatusPill>
                        ) : null}
                      </span>
                      <ChevronRight aria-hidden size={16} className="shrink-0 text-text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('history.client.openIncidents')}
          description={t('history.client.openIncidentsHint')}
        />
        {incidents === null ? (
          <SkeletonText lines={2} />
        ) : incidents.length === 0 ? (
          <EmptyState
            compact
            icon={<ShieldCheck size={20} />}
            title={t('history.client.noOpenIncidents')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link
                  to={historyLink(i.poolId, i.reportId)}
                  className={cn(
                    'flex items-start gap-3 rounded-[var(--radius-md)] border border-status-red/30 bg-status-red-bg/50 px-3 py-2 transition-colors hover:bg-status-red-bg',
                    focusRing,
                  )}
                >
                  <TriangleAlert
                    aria-hidden
                    size={16}
                    className="mt-0.5 shrink-0 text-status-red-text"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{i.description}</span>
                    <span className="block text-xs text-text-muted">
                      {[poolName.get(i.poolId), basinName.get(i.basinId)]
                        .filter(Boolean)
                        .join(' · ')}{' '}
                      · {formatDate(i.visitedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-text">
          {t('history.client.timeline')}
        </h2>
        <VisitHistory
          poolIds={poolIds}
          filterKind="pool"
          filterOptions={(pools ?? []).map((p) => ({ id: p.id, label: p.denominacion }))}
          showPool
          title={t('history.client.timeline')}
        />
      </div>

      {editing && (
        <ClientFormModal
          client={client}
          orgId={profile.org.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{children || t('common.none')}</dd>
    </div>
  );
}

function ClientSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-8 h-8 w-72 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <SkeletonText lines={4} />
        </Card>
        <Card className="lg:col-span-2">
          <SkeletonText lines={4} />
        </Card>
      </div>
    </div>
  );
}
