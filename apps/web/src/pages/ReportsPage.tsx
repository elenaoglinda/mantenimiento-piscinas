import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, FileUp, Plus, Waves } from 'lucide-react';
import { parseVisitFilters, writeVisitFilters, type VisitFilters } from '@piscinas/shared';
import { useAuth } from '../auth/context.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { DataTable, TableToolbar, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { cn, focusRing, fold } from '../components/ui/utils.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import {
  ExportCsvButton,
  FailureAlert,
  useVisitFilterOptions,
  useVisitPages,
  visitOutOfRange,
  VisitFilters as VisitFiltersBar,
  type Visit,
  type VisitScope,
} from '../features/history/index.js';

type StatusFilter = NonNullable<VisitFilters['status']> | 'all';
const FILTERS: StatusFilter[] = ['all', 'draft', 'completed', 'signed'];

/** Visits per page on Informes. */
const PAGE_SIZE = 50;

export function ReportsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;
  const isCompany = profile?.org.type === 'company';

  // Every filter lives in the URL (?desde=…&cliente=…&fuera=1), so a filtered list can be
  // bookmarked or sent. ⌘K deep-links a search here with ?q=.
  const [params, setParams] = useSearchParams();
  const filters = parseVisitFilters((k) => params.get(k));
  const [query, setQuery] = useState(params.get('q') ?? '');
  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);
  const search = useDebounced(query.trim(), 250);

  const setFilters = (patch: Partial<VisitFilters>) =>
    setParams(writeVisitFilters(params, patch), { replace: true });
  const clearFilters = () => {
    const next = writeVisitFilters(params, {
      from: null,
      to: null,
      client: null,
      pool: null,
      technician: null,
      outOfRange: false,
    });
    setParams(next, { replace: true });
  };

  const { options, failure: optionsFailure } = useVisitFilterOptions();

  const scope: VisitScope | null = useMemo(() => {
    if (!options) return null;
    let poolIds: string[] | undefined;
    if (filters.client)
      poolIds = options.pools.filter((p) => p.clientId === filters.client).map((p) => p.id);
    // The search box matches pool and client names.
    const q = fold(search);
    if (q) {
      const match = new Set(
        options.pools
          .filter((p) => fold(`${p.label} ${p.detail ?? ''}`).includes(q))
          .map((p) => p.id),
      );
      poolIds = (poolIds ?? options.pools.map((p) => p.id)).filter((id) => match.has(id));
    }
    const pool = filters.pool && (!poolIds || poolIds.includes(filters.pool)) ? filters.pool : null;
    return {
      from: filters.from,
      to: filters.to,
      technician: filters.technician,
      outOfRange: filters.outOfRange,
      status: filters.status,
      pool,
      poolIds: pool ? undefined : poolIds,
    };
  }, [
    options,
    search,
    filters.client,
    filters.pool,
    filters.from,
    filters.to,
    filters.technician,
    filters.outOfRange,
    filters.status,
  ]);

  const { catalog, visits, hasMore, loadingMore, failure, loadMore } = useVisitPages(
    scope,
    PAGE_SIZE,
  );

  const poolCount = options?.pools.length ?? 0;
  const clientCount = options?.clients.length ?? 0;
  const needsSetup = options !== null && poolCount === 0;
  const setupHint =
    isCompany && clientCount === 0 ? t('reports.needClientAndPool') : t('reports.needPool');
  const status: StatusFilter = filters.status ?? 'all';
  const narrowed = Boolean(
    search ||
    filters.status ||
    filters.from ||
    filters.to ||
    filters.client ||
    filters.pool ||
    filters.technician ||
    filters.outOfRange,
  );

  const columns: Column<Visit>[] = [
    {
      id: 'pool',
      header: t('reports.pool'),
      cell: (r) => (
        <span className="flex flex-col">
          <span>
            {r.poolName ?? '—'} · {r.basinName ?? '—'}
          </span>
          {isCompany && r.clientName && !r.clientIsSelf && (
            <span className="text-xs font-normal text-text-muted">{r.clientName}</span>
          )}
          <time dateTime={r.visitedAt} className="text-xs font-normal text-text-muted sm:hidden">
            {new Date(r.visitedAt).toLocaleString('es-ES')}
          </time>
        </span>
      ),
    },
    {
      id: 'date',
      header: t('reports.visitedAt'),
      cell: (r) => (
        <time dateTime={r.visitedAt}>{new Date(r.visitedAt).toLocaleString('es-ES')}</time>
      ),
      hideBelow: 'sm',
    },
    {
      id: 'technician',
      header: t('history.filters.technician'),
      cell: (r) => r.technicianName ?? t('common.none'),
      hideBelow: 'md',
    },
    {
      id: 'readings',
      header: t('history.readings'),
      cell: (r) =>
        catalog && visitOutOfRange(r, catalog) ? (
          <StatusPill tone="red">{t('status.red')}</StatusPill>
        ) : r.readings.some((m) => m.value != null) ? (
          <span className="text-sm text-text-muted">{t('history.readingsInRange')}</span>
        ) : (
          <span className="text-sm text-text-muted">{t('common.none')}</span>
        ),
      hideBelow: 'lg',
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
        title={t('reports.title')}
        description={t('reports.subtitle')}
        actions={
          canWrite &&
          !needsSetup &&
          options !== null && (
            <>
              <Button asChild variant="secondary">
                <Link to="/reports/import">
                  <FileUp aria-hidden size={16} />
                  {t('photoImport.entryAction')}
                </Link>
              </Button>
              <Button asChild>
                <Link to="/reports/new">
                  <Plus aria-hidden size={16} />
                  {t('reports.addReport')}
                </Link>
              </Button>
            </>
          )
        }
      />

      <FailureAlert failure={optionsFailure ?? failure} />

      {needsSetup ? (
        <Card padded={false}>
          <EmptyState
            icon={<Waves size={22} />}
            title={t('reports.setupTitle')}
            description={setupHint}
            action={
              canWrite && (
                <Button asChild>
                  <Link to={isCompany && clientCount === 0 ? '/clients' : '/pools'}>
                    {isCompany && clientCount === 0
                      ? t('pools.addClientFirst')
                      : t('pools.addPool')}
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <TableToolbar
            search={query}
            onSearch={(q) => {
              setQuery(q);
              const next = new URLSearchParams(params);
              if (q.trim()) next.set('q', q);
              else next.delete('q');
              setParams(next, { replace: true });
            }}
            searchPlaceholder={t('reports.searchPlaceholder')}
            actions={<ExportCsvButton scope={scope} catalog={catalog} />}
          >
            <div
              role="group"
              aria-label={t('reports.statusFilter')}
              className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={status === f}
                  onClick={() => setFilters({ status: f === 'all' ? null : f })}
                  className={cn(
                    'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                    focusRing,
                    status === f
                      ? 'bg-accent-soft text-navy-800'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  {f === 'all' ? t('reports.allStatuses') : t(`reportStatus.${f}`)}
                </button>
              ))}
            </div>
          </TableToolbar>
          {options && (
            <VisitFiltersBar
              filters={filters}
              onChange={setFilters}
              onClear={clearFilters}
              clients={options.clients}
              pools={options.pools}
              technicians={options.technicians}
              showClient={!!isCompany}
            />
          )}
          <DataTable
            caption={t('reports.title')}
            columns={columns}
            rows={visits ?? []}
            getRowId={(r) => r.id}
            rowHref={(r) => `/reports/${r.id}`}
            loading={visits === null && !failure && !optionsFailure}
            empty={
              !narrowed ? (
                <EmptyState
                  icon={<ClipboardList size={22} />}
                  title={t('reports.emptyTitle')}
                  description={t('reports.emptyHint')}
                  action={
                    canWrite && (
                      <Button asChild>
                        <Link to="/reports/new">
                          <Plus aria-hidden size={16} />
                          {t('reports.addReport')}
                        </Link>
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState
                  compact
                  icon={<ClipboardList size={20} />}
                  title={t('reports.noMatches')}
                  description={t('reports.noMatchesHint')}
                />
              )
            }
          />
          {visits && visits.length > 0 && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs text-text-muted" aria-live="polite">
                {t('history.shown', { count: visits.length })}
              </p>
              {hasMore && (
                <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                  {t('history.loadMore')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
