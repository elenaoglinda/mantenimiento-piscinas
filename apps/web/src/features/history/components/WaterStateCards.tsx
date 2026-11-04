import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Droplets, Plus, TriangleAlert } from 'lucide-react';
import { daysSince, latestStateByBasin, type BasinState } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import type { DbFailure } from '../../../lib/dbError.js';
import {
  fetchRecentActivity,
  type OpenIncident,
  type ParamCatalog,
  type RecentActivity,
} from '../lib/data.js';
import { formatDate, formatDateTime, formatDaysAgo, formatShortDate } from '../lib/format.js';
import { historyLink } from '../lib/links.js';
import { useParamCatalog } from '../lib/useParamCatalog.js';
import { FailureAlert } from './FailureAlert.js';
import { ReadingChip } from './ReadingChip.js';

interface BasinRef {
  id: string;
  denominacion: string;
}

/**
 * "Último estado del agua": one card per vaso with the latest value of every parameter and its
 * traffic light, when it was read, how long since the last visit, and the open incidents —
 * so the state of a pool is clear without opening a single report.
 */
export function WaterStateCards({
  poolId,
  ccaa,
  basins,
  canWrite,
}: {
  poolId: string;
  ccaa: string | null;
  basins: BasinRef[];
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const { catalog, failure: catalogFailure } = useParamCatalog();
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  useEffect(() => {
    if (!catalog) return;
    let active = true;
    void fetchRecentActivity([poolId], catalog).then((r) => {
      if (!active) return;
      setActivity(r.data);
      setFailure(r.failure);
    });
    return () => {
      active = false;
    };
  }, [poolId, catalog]);

  const states = useMemo(
    () =>
      catalog && activity
        ? latestStateByBasin(
            activity.readings,
            catalog.evaluatorDefs(ccaa),
            basins.map((b) => b.id),
          )
        : null,
    [activity, catalog, ccaa, basins],
  );

  if (catalogFailure || failure) return <FailureAlert failure={catalogFailure ?? failure} />;
  if (basins.length === 0) return null;

  return (
    <section aria-labelledby="water-state-title" className="flex flex-col gap-3">
      <h2 id="water-state-title" className="font-display text-lg font-semibold text-text">
        {t('history.state.title')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {basins.map((b) =>
          states && activity && catalog ? (
            <BasinStateCard
              key={b.id}
              poolId={poolId}
              basin={b}
              state={states.get(b.id)!}
              lastVisit={activity.lastVisitByBasin.get(b.id) ?? null}
              incidents={activity.openIncidents.filter((i) => i.basinId === b.id)}
              catalog={catalog}
              ccaa={ccaa}
              canWrite={canWrite}
            />
          ) : (
            <Card key={b.id} aria-busy="true">
              <Skeleton className="mb-3 h-5 w-40" />
              <Skeleton className="mb-4 h-4 w-56" />
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            </Card>
          ),
        )}
      </div>
    </section>
  );
}

function BasinStateCard({
  poolId,
  basin,
  state,
  lastVisit,
  incidents,
  catalog,
  ccaa,
  canWrite,
}: {
  poolId: string;
  basin: BasinRef;
  state: BasinState;
  lastVisit: string | null;
  incidents: OpenIncident[];
  catalog: ParamCatalog;
  ccaa: string | null;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const defs = catalog.forRegion(ccaa);
  const headingId = `water-state-${basin.id}`;

  return (
    <Card aria-labelledby={headingId} role="region">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold text-text">
            {basin.denominacion}
          </h3>
          <p className="mt-0.5 text-sm text-text-muted">
            {lastVisit ? (
              <>
                {t('history.state.lastVisit')}{' '}
                <time dateTime={lastVisit}>{formatDateTime(lastVisit)}</time> ·{' '}
                <strong className="font-medium text-text">
                  {formatDaysAgo(t, daysSince(lastVisit))}
                </strong>
              </>
            ) : (
              t('dashboard.neverVisited')
            )}
          </p>
        </div>
        {state.params.length > 0 && (
          <StatusPill tone={state.status}>{t(`history.state.overall.${state.status}`)}</StatusPill>
        )}
      </div>

      {state.params.length === 0 ? (
        <EmptyState
          compact
          icon={<Droplets size={20} />}
          title={t('history.state.emptyTitle')}
          description={t('history.state.emptyHint')}
          action={
            canWrite && (
              <Button asChild size="sm" variant="secondary">
                <Link to={`/reports/new?poolId=${poolId}`}>
                  <Plus aria-hidden size={14} />
                  {t('reports.addReport')}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {state.params.map((p) => {
            const def = defs.get(p.siloeParamId);
            const name = def?.name_es ?? `#${p.siloeParamId}`;
            return (
              <div
                key={p.siloeParamId}
                className="flex min-w-0 items-center justify-between gap-2 border-b border-border py-1.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <dt className="min-w-0 text-sm break-words text-text-muted">{name}</dt>
                <dd className="flex shrink-0 items-center gap-2">
                  <ReadingChip
                    label=""
                    value={p.value}
                    unit={def?.unit}
                    status={p.status}
                    title={formatDateTime(p.visitedAt)}
                  />
                  <time
                    dateTime={p.visitedAt}
                    className="text-xs text-text-muted"
                    title={formatDate(p.visitedAt)}
                  >
                    {formatShortDate(p.visitedAt)}
                  </time>
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {incidents.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-status-red/30 bg-status-red-bg/50 px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-medium text-status-red-text">
            <TriangleAlert aria-hidden size={14} />
            {t('history.state.openIncidents', { count: incidents.length })}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {incidents.slice(0, 3).map((i) => (
              <li key={i.id} className="text-sm">
                <Link
                  to={historyLink(poolId, i.reportId)}
                  className="text-text underline-offset-4 hover:underline"
                >
                  {i.description}
                </Link>{' '}
                <span className="text-xs text-text-muted">· {formatDate(i.visitedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
