import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  ChevronDown,
  ClipboardList,
  FileText,
  PenLine,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import {
  isExtraParamKey,
  KEY_PARAM_IDS,
  parseVisitFilters,
  writeVisitFilters,
  type VisitFilters,
} from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Field, Input, NativeSelect } from '../../../components/ui/Input.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import { ReportStatusBadge } from '../../../components/ReportStatusBadge.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchVisit, type ParamCatalog, type Visit } from '../lib/data.js';
import { formatDate, formatTime, paramLabel } from '../lib/format.js';
import {
  ServiceLogAlert,
  useVisitLogs,
  VisitLogDetails,
  VisitLogIcons,
  type VisitLog,
} from '../../service-log/index.js';
import { VISIT_PARAM } from '../lib/links.js';
import { visitOutOfRange, visitReadingStatus } from '../lib/visit.js';
import { useVisitPages } from '../lib/useVisitPages.js';
import { FailureAlert } from './FailureAlert.js';
import { ReadingChip } from './ReadingChip.js';

/** Visits per page. "Cargar más" fetches the next 30. */
export const HISTORY_PAGE_SIZE = 30;

export interface FilterOption {
  id: string;
  label: string;
}

/**
 * A visit timeline, newest first: one row per visit with the four key readings inline (amber
 * and red marked), icons for incidents, photos and signature. A row expands to every reading
 * and links to the full report. Filters (vaso or pool, date range) live in the URL, as does
 * `?visita=<id>`, which opens that visit expanded — what the dashboard alerts and the bell
 * link to.
 *
 * Used on the pool page (scope: one pool, filter by vaso) and on the client page (scope: the
 * client's pools, filter by pool, with the pool name on each row).
 */
export function VisitHistory({
  poolId,
  poolIds,
  filterKind,
  filterOptions,
  showPool = false,
  newReportHref,
  title,
}: {
  /** One pool… */
  poolId?: string;
  /** …or several (a client's). */
  poolIds?: string[];
  filterKind: 'basin' | 'pool';
  filterOptions: FilterOption[];
  showPool?: boolean;
  /** Where "Nuevo informe" goes in the empty state; omit to hide it (viewers). */
  newReportHref?: string;
  title: string;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = parseVisitFilters((k) => params.get(k));
  const focusId = params.get(VISIT_PARAM);

  const filterValue = filterKind === 'basin' ? filters.basin : filters.pool;
  // A pool filter must stay inside the client's pools; anything else is ignored.
  const validFilter = filterOptions.some((o) => o.id === filterValue) ? filterValue : null;
  const poolIdsKey = poolIds ? poolIds.join(',') : null;
  const scope = useMemo(() => {
    const ids = poolIdsKey === null ? undefined : poolIdsKey === '' ? [] : poolIdsKey.split(',');
    return {
      pool: filterKind === 'pool' && validFilter ? validFilter : poolId,
      poolIds: filterKind === 'pool' && validFilter ? undefined : ids,
      basin: filterKind === 'basin' ? validFilter : null,
      from: filters.from,
      to: filters.to,
    };
  }, [filterKind, validFilter, poolId, poolIdsKey, filters.from, filters.to]);

  const { catalog, visits, hasMore, loadingMore, failure, loadMore } = useVisitPages(
    scope,
    HISTORY_PAGE_SIZE,
  );
  const [linkFailure, setLinkFailure] = useState<DbFailure | null>(null);
  // Products and tasks of the visits on screen (a separate query: see service-log README).
  const [pinned, setPinned] = useState<Visit | null>(null);
  const visitIds = useMemo(
    () => [...(pinned ? [pinned.id] : []), ...(visits ?? []).map((v) => v.id)],
    [visits, pinned],
  );
  const { logOf, failure: logFailure } = useVisitLogs(visitIds);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []));

  // A linked visit that isn't in the loaded pages (older, or filtered out) is fetched on its
  // own and shown above the list, so the link always lands somewhere.
  useEffect(() => {
    if (!focusId || !catalog || visits === null) return;
    setExpanded((s) => (s.has(focusId) ? s : new Set(s).add(focusId)));
    if (visits.some((v) => v.id === focusId)) {
      setPinned(null);
      return;
    }
    let active = true;
    void fetchVisit(focusId, catalog).then((r) => {
      if (!active) return;
      setLinkFailure(r.failure);
      const inScope =
        r.data && (poolId ? r.data.poolId === poolId : !poolIds || poolIds.includes(r.data.poolId));
      setPinned(inScope ? r.data : null);
    });
    return () => {
      active = false;
    };
  }, [focusId, catalog, visits, poolId, poolIds]);

  // Bring the linked visit into view once it's on screen.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || scrolledFor.current === focusId) return;
    const el = document.getElementById(`visita-${focusId}`);
    if (!el) return;
    scrolledFor.current = focusId;
    el.scrollIntoView({ block: 'center' });
    el.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true });
  }, [focusId, visits, pinned]);

  const setFilter = (patch: Partial<VisitFilters>) => {
    const next = writeVisitFilters(params, patch);
    next.delete(VISIT_PARAM);
    setParams(next, { replace: true });
  };
  const clearFilters = () =>
    setFilter({ from: null, to: null, [filterKind === 'basin' ? 'basin' : 'pool']: null });
  const filtered = Boolean(validFilter || filters.from || filters.to);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label={filterKind === 'basin' ? t('reports.basin') : t('reports.pool')}
          className="w-full sm:w-56"
        >
          <NativeSelect
            value={validFilter ?? ''}
            onChange={(e) =>
              setFilter({ [filterKind === 'basin' ? 'basin' : 'pool']: e.target.value || null })
            }
          >
            <option value="">
              {filterKind === 'basin'
                ? t('history.filters.allBasins')
                : t('history.filters.allPools')}
            </option>
            {filterOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('history.filters.from')} className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(e) => setFilter({ from: e.target.value || null })}
          />
        </Field>
        <Field label={t('history.filters.to')} className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(e) => setFilter({ to: e.target.value || null })}
          />
        </Field>
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            {t('history.filters.clear')}
          </Button>
        )}
      </div>

      <FailureAlert failure={failure ?? linkFailure} />
      {visits && visits.length > 0 && <ServiceLogAlert failure={logFailure} />}

      {pinned && catalog && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t('history.linkedVisit')}
          </p>
          <Card padded={false}>
            <ul>
              <VisitRow
                log={logOf(pinned.id)}
                visit={pinned}
                catalog={catalog}
                showPool={showPool}
                expanded={expanded.has(pinned.id)}
                onToggle={() => toggle(pinned.id)}
              />
            </ul>
          </Card>
        </div>
      )}

      {visits === null || !catalog ? (
        failure ? null : (
          <Card padded={false} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 border-b border-border px-5 py-4 last:border-0"
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-6 w-72 max-w-full" />
              </div>
            ))}
          </Card>
        )
      ) : visits.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={filtered ? t('history.noMatches') : t('history.emptyTitle')}
            description={filtered ? t('history.noMatchesHint') : t('history.emptyHint')}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t('history.filters.clear')}
                </Button>
              ) : (
                newReportHref && (
                  <Button asChild>
                    <Link to={newReportHref}>
                      <Plus aria-hidden size={16} />
                      {t('reports.addReport')}
                    </Link>
                  </Button>
                )
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <ul aria-label={title}>
              {visits.map((v) => (
                <VisitRow
                  key={v.id}
                  log={logOf(v.id)}
                  visit={v}
                  catalog={catalog}
                  showPool={showPool}
                  expanded={expanded.has(v.id)}
                  highlighted={v.id === focusId}
                  onToggle={() => toggle(v.id)}
                />
              ))}
            </ul>
          </Card>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-text-muted" aria-live="polite">
              {t('history.shown', { count: visits.length })}
            </p>
            {hasMore && (
              <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                {t('history.loadMore')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function VisitRow({
  log,
  visit,
  catalog,
  showPool,
  expanded,
  highlighted = false,
  onToggle,
}: {
  /** Products and tasks of this visit (service log); empty while loading. */
  log: VisitLog;
  visit: Visit;
  catalog: ParamCatalog;
  showPool: boolean;
  expanded: boolean;
  highlighted?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const defs = catalog.forRegion(visit.ccaa);
  const bySiloe = new Map(visit.readings.map((r) => [r.siloeParamId, r]));
  const panelId = `visita-${visit.id}-detalle`;
  const openIncidents = visit.incidents.filter((i) => i.open).length;
  const status = (siloeId: number) => visitReadingStatus(visit, siloeId, catalog);
  const outOfRange = visitOutOfRange(visit, catalog);
  const where = [showPool ? visit.poolName : null, visit.basinName].filter(Boolean).join(' · ');

  return (
    <li
      id={`visita-${visit.id}`}
      className={cn(
        'border-b border-border last:border-0',
        highlighted && 'bg-accent-soft/60',
        outOfRange && 'border-l-4 border-l-status-red',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/60 sm:px-5',
          focusRing,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <time dateTime={visit.visitedAt} className="font-medium text-text tabular-nums">
              {formatDate(visit.visitedAt)} · {formatTime(visit.visitedAt)}
            </time>
            <span className="min-w-0 truncate text-sm text-text">{where || t('common.none')}</span>
            <span className="text-sm text-text-muted">
              {visit.technicianName ?? t('history.noTechnician')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {KEY_PARAM_IDS.map((id) => {
              const r = bySiloe.get(id);
              return (
                <ReadingChip
                  key={id}
                  label={paramLabel(t, id, defs.get(id)?.name_es)}
                  value={r?.value ?? null}
                  unit={defs.get(id)?.unit}
                  status={status(id)}
                />
              );
            })}
            <VisitIcons visit={visit} openIncidents={openIncidents} />
            <VisitLogIcons log={log} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReportStatusBadge status={visit.status} />
          <ChevronDown
            aria-hidden
            size={16}
            className={cn('text-text-muted transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-border bg-surface-muted/40 px-4 py-4 sm:px-5">
          {visit.readings.length === 0 ? (
            <p className="text-sm text-text-muted">{t('history.noReadings')}</p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {[...visit.readings]
                .sort((a, b) => (a.siloeParamId ?? 99) - (b.siloeParamId ?? 99))
                .map((r) => {
                  const def = r.siloeParamId != null ? defs.get(r.siloeParamId) : undefined;
                  const name =
                    def?.name_es ??
                    catalog.rows.find((x) => x.id === r.parameterDefId)?.name_es ??
                    '—';
                  return (
                    <div
                      key={r.parameterDefId}
                      className="flex items-center justify-between gap-2 py-1"
                    >
                      <dt className="min-w-0 truncate text-sm text-text-muted">{name}</dt>
                      <dd>
                        <ReadingChip
                          label=""
                          value={r.value}
                          unit={def?.unit}
                          status={r.siloeParamId != null ? status(r.siloeParamId) : r.status}
                          recommended={r.siloeParamId != null && isExtraParamKey(r.siloeParamId)}
                        />
                      </dd>
                    </div>
                  );
                })}
            </dl>
          )}
          <div className="mt-4 empty:hidden">
            <VisitLogDetails log={log} />
          </div>
          {visit.incidents.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
                {t('reports.incidents')}
              </h4>
              <ul className="mt-1 flex flex-col gap-1.5">
                {visit.incidents.map((i) => (
                  <li key={i.id} className="text-sm">
                    <span className="font-medium text-text">{i.description}</span>
                    {i.open ? (
                      <span className="ml-2 text-xs font-medium text-status-red-text">
                        {t('history.incidentOpen')}
                      </span>
                    ) : (
                      <span className="block text-text-muted">
                        {t('reports.correctiveAction')}: {i.correctiveAction}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-text-muted">
              {t(`analysisType.${visit.analysisType}`)}
            </span>
            <Button asChild size="sm" variant="secondary">
              <Link to={`/reports/${visit.id}`}>{t('history.openReport')}</Link>
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Incidents, photos, lab PDFs and signature as icons with their words for screen readers. */
function VisitIcons({ visit, openIncidents }: { visit: Visit; openIncidents: number }) {
  const { t } = useTranslation();
  const items = [
    visit.incidents.length > 0 && {
      key: 'inc',
      Icon: TriangleAlert,
      n: visit.incidents.length,
      label:
        openIncidents > 0
          ? t('history.icons.incidentsOpen', { count: visit.incidents.length, open: openIncidents })
          : t('history.icons.incidents', { count: visit.incidents.length }),
      tone: openIncidents > 0 ? 'text-status-red-text' : 'text-text-muted',
    },
    visit.photoCount > 0 && {
      key: 'photo',
      Icon: Camera,
      n: visit.photoCount,
      label: t('history.icons.photos', { count: visit.photoCount }),
      tone: 'text-text-muted',
    },
    visit.labPdfCount > 0 && {
      key: 'pdf',
      Icon: FileText,
      n: visit.labPdfCount,
      label: t('history.icons.labPdfs', { count: visit.labPdfCount }),
      tone: 'text-text-muted',
    },
    visit.status === 'signed' && {
      key: 'signed',
      Icon: PenLine,
      n: null,
      label: t('history.icons.signed'),
      tone: 'text-status-green-text',
    },
  ].filter(Boolean) as {
    key: string;
    Icon: typeof Camera;
    n: number | null;
    label: string;
    tone: string;
  }[];
  if (items.length === 0) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-2.5">
      {items.map(({ key, Icon, n, label, tone }) => (
        <span
          key={key}
          title={label}
          className={cn('inline-flex items-center gap-0.5 text-xs', tone)}
        >
          <Icon aria-hidden size={14} />
          {n != null && <span aria-hidden>{n}</span>}
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
}
