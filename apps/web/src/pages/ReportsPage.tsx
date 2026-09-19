import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import type { Enums, Tables } from '../lib/database.types.js';

type ReportRow = Tables<'report'> & {
  pool: { denominacion: string } | null;
  basin: { denominacion: string } | null;
};
type StatusFilter = Enums<'report_status'> | 'all';

export function ReportsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const isCompany = profile?.org.type === 'company';
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [poolCount, setPoolCount] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
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

  const needsSetup = poolCount === 0;
  const setupHint =
    isCompany && clientCount === 0 ? t('reports.needClientAndPool') : t('reports.needPool');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">{t('reports.title')}</h1>
          <p className="text-sm text-text-muted">{t('reports.subtitle')}</p>
        </div>
        {canWrite && !needsSetup && !loading && (
          <div className="flex flex-wrap gap-2">
            <Link to="/reports/import">
              <Button variant="secondary">{t('photoImport.entryAction')}</Button>
            </Link>
            <Link to="/reports/new">
              <Button>{t('reports.addReport')}</Button>
            </Link>
          </div>
        )}
      </div>

      {!needsSetup && !loading && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-muted" htmlFor="statusFilter">
            {t('reports.statusFilter')}
          </label>
          <select
            id="statusFilter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            className="rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-1.5 text-sm text-text"
          >
            <option value="all">{t('reports.allStatuses')}</option>
            <option value="draft">{t('reportStatus.draft')}</option>
            <option value="completed">{t('reportStatus.completed')}</option>
            <option value="signed">{t('reportStatus.signed')}</option>
          </select>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : needsSetup ? (
        <Card>
          <p className="text-text-muted">{setupHint}</p>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <p className="text-text-muted">{t('reports.empty')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <Link
              key={r.id}
              to={`/reports/${r.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-text">
                  {r.pool?.denominacion ?? '—'} · {r.basin?.denominacion ?? '—'}
                </p>
                <p className="text-sm text-text-muted">
                  {new Date(r.visited_at).toLocaleString('es-ES')}
                </p>
              </div>
              <ReportStatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
