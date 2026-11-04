import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, FileUp, Plus, Waves } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { DataTable, TableToolbar, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { cn, focusRing, fold } from '../components/ui/utils.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import type { Enums, Tables } from '../lib/database.types.js';

type ReportRow = Tables<'report'> & {
  pool: { denominacion: string } | null;
  basin: { denominacion: string } | null;
};
type StatusFilter = Enums<'report_status'> | 'all';

const FILTERS: StatusFilter[] = ['all', 'draft', 'completed', 'signed'];

export function ReportsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const isCompany = profile?.org.type === 'company';
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [poolCount, setPoolCount] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
  // ⌘K can deep-link a search here with ?q=, also while this page is already open.
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  useEffect(() => {
    const q = params.get('q');
    if (q !== null) setQuery(q);
  }, [params]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('report')
      .select(
        '*, pool!report_pool_id_org_id_fkey(denominacion), basin!report_basin_id_org_id_fkey(denominacion)',
      )
      .order('visited_at', { ascending: false });
    if (filter !== 'all') query = query.eq('status', filter);
    const [{ data, error }, { count: clients }, { count: pools }] = await Promise.all([
      query,
      supabase.from('client').select('id', { count: 'exact', head: true }).eq('archived', false),
      supabase.from('pool').select('id', { count: 'exact', head: true }).eq('archived', false),
    ]);
    if (error) setError(t('common.genericError'));
    else setReports((data as ReportRow[]) ?? []);
    setClientCount(clients ?? 0);
    setPoolCount(pools ?? 0);
    setLoading(false);
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The first load decides whether setup is needed; later filter reloads keep the table.
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setLoadedOnce(true);
  }, [loading]);

  const needsSetup = loadedOnce && poolCount === 0;
  const setupHint =
    isCompany && clientCount === 0 ? t('reports.needClientAndPool') : t('reports.needPool');

  const rows = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return reports;
    return reports.filter((r) =>
      fold(`${r.pool?.denominacion ?? ''} ${r.basin?.denominacion ?? ''}`).includes(q),
    );
  }, [reports, query]);

  const columns: Column<ReportRow>[] = [
    {
      id: 'pool',
      header: t('reports.pool'),
      cell: (r) => (
        <span className="flex flex-col">
          <span>
            {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
          </span>
          <time dateTime={r.visited_at} className="text-xs font-normal text-text-muted sm:hidden">
            {new Date(r.visited_at).toLocaleString('es-ES')}
          </time>
        </span>
      ),
      sortValue: (r) => `${r.pool?.denominacion ?? ''} ${r.basin?.denominacion ?? ''}`,
    },
    {
      id: 'date',
      header: t('reports.visitedAt'),
      cell: (r) => (
        <time dateTime={r.visited_at}>{new Date(r.visited_at).toLocaleString('es-ES')}</time>
      ),
      sortValue: (r) => r.visited_at,
      hideBelow: 'sm',
    },
    {
      id: 'type',
      header: t('reports.analysisType'),
      cell: (r) => t(`analysisType.${r.analysis_type}`),
      sortValue: (r) => r.analysis_type,
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('reports.statusFilter'),
      cell: (r) => <ReportStatusBadge status={r.status} />,
      sortValue: (r) => r.status,
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
          loadedOnce && (
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

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : needsSetup ? (
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
            onSearch={setQuery}
            searchPlaceholder={t('reports.searchPlaceholder')}
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
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                    focusRing,
                    filter === f
                      ? 'bg-accent-soft text-navy-800'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  {f === 'all' ? t('reports.allStatuses') : t(`reportStatus.${f}`)}
                </button>
              ))}
            </div>
          </TableToolbar>
          <DataTable
            caption={t('reports.title')}
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            rowHref={(r) => `/reports/${r.id}`}
            loading={loading}
            empty={
              reports.length === 0 && filter === 'all' ? (
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
        </>
      )}
    </div>
  );
}
