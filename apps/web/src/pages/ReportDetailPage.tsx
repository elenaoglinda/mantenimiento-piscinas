import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { PenLine, Pencil, Printer, TriangleAlert } from 'lucide-react';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { useRecordCrumb } from '../features/app-shell/index.js';
import { ReportServiceLogCard } from '../features/service-log/index.js';
import { StatusChip } from '../components/ui/StatusChip.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import { SignModal } from '../components/SignModal.js';
import { AttachmentsSection } from '../components/AttachmentsSection.js';
import type { Tables } from '../lib/database.types.js';
import { HScroll } from '../components/ui/HScroll.js';

type Report = Tables<'report'> & {
  pool: { denominacion: string } | null;
  basin: { denominacion: string } | null;
};
type Measurement = Tables<'measurement'> & {
  parameter_def: { name_es: string; unit: string | null } | null;
};

export function ReportDetailPage() {
  const { t } = useTranslation();
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  const [report, setReport] = useState<Report | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [incidents, setIncidents] = useState<Tables<'incident'>[]>([]);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    const [{ data: rep, error: e1 }, { data: meas }, { data: incs }] = await Promise.all([
      supabase
        .from('report')
        .select(
          '*, pool!report_pool_id_org_id_fkey(denominacion), basin!report_basin_id_org_id_fkey(denominacion)',
        )
        .eq('id', reportId)
        .maybeSingle(),
      supabase
        .from('measurement')
        .select('*, parameter_def(name_es, unit)')
        .eq('report_id', reportId),
      supabase.from('incident').select('*').eq('report_id', reportId),
    ]);
    if (e1 || !rep) {
      setError(t('common.genericError'));
      setLoading(false);
      return;
    }
    setReport(rep as Report);
    setMeasurements((meas as Measurement[]) ?? []);
    setIncidents(incs ?? []);
    if (rep.signature_path) {
      const { data: signed } = await supabase.storage
        .from('reports')
        .createSignedUrl(rep.signature_path, 3600);
      setSignatureUrl(signed?.signedUrl ?? null);
    }
    setLoading(false);
  }, [reportId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useRecordCrumb(
    report
      ? [report.pool?.denominacion, report.basin?.denominacion].filter(Boolean).join(' · ')
      : null,
  );

  if (loading) return <ReportDetailSkeleton />;
  if (error || !report) return <Alert tone="error">{error ?? t('common.genericError')}</Alert>;

  const isSigned = report.status === 'signed';
  const outOfRange = measurements.filter((m) => m.status === 'red').length;

  return (
    <div>
      <PageHeader
        back={{ to: '/reports', label: t('nav.reports') }}
        title={`${report.pool?.denominacion ?? '—'} · ${report.basin?.denominacion ?? '—'}`}
        description={
          <>
            <time dateTime={report.visited_at}>
              {new Date(report.visited_at).toLocaleString('es-ES')}
            </time>{' '}
            · {t(`analysisType.${report.analysis_type}`)}
          </>
        }
        badges={<ReportStatusBadge status={report.status} />}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer aria-hidden size={16} />
              {t('common.print')}
            </Button>
            {canWrite && !isSigned && (
              <>
                <Button variant="secondary" onClick={() => navigate(`/reports/${report.id}/edit`)}>
                  <Pencil aria-hidden size={16} />
                  {t('common.edit')}
                </Button>
                {report.status === 'completed' && (
                  <Button onClick={() => setSigning(true)}>
                    <PenLine aria-hidden size={16} />
                    {t('reports.signAction')}
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {outOfRange > 0 && (
            <Alert tone="error">{t('reports.outOfRangeCount', { count: outOfRange })}</Alert>
          )}

          <Card padded={false}>
            <CardHeader title={t('reports.parameters')} className="mb-0 px-5 pt-5 pb-3 sm:px-6" />
            {measurements.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-text-muted sm:px-6">{t('common.none')}</p>
            ) : (
              <HScroll label={t('reports.parameters')}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-border bg-surface-muted/60 text-xs text-text-muted">
                      <th scope="col" className="px-5 py-2 font-semibold sm:px-6">
                        {t('reports.parameter')}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        {t('reports.value')}
                      </th>
                      <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">
                        {t('reports.lugar')}
                      </th>
                      <th scope="col" className="px-5 py-2 text-right font-semibold sm:px-6">
                        {t('reports.statusFilter')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5 text-text sm:px-6">
                          {m.parameter_def?.name_es ?? '—'}
                          {m.parameter_def?.unit && (
                            <span className="ml-1 text-xs text-text-muted">
                              ({m.parameter_def.unit})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-text tabular-nums">
                          {m.value ?? '—'}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-text-muted sm:table-cell">
                          {t(`lugar.${m.lugar}`)}
                        </td>
                        <td className="px-5 py-2.5 text-right sm:px-6">
                          <StatusChip status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HScroll>
            )}
          </Card>

          <ReportServiceLogCard reportId={report.id} />

          {incidents.length > 0 && (
            <Card>
              <CardHeader title={t('reports.incidents')} />
              <ul className="flex flex-col gap-3">
                {incidents.map((i) => (
                  <li
                    key={i.id}
                    className="flex gap-3 rounded-[var(--radius-md)] border border-status-amber/30 bg-status-amber-bg/40 p-3"
                  >
                    <TriangleAlert
                      aria-hidden
                      size={16}
                      className="mt-0.5 shrink-0 text-status-amber-text"
                    />
                    <div>
                      <p className="text-text">{i.description}</p>
                      {i.corrective_action && (
                        <p className="mt-0.5 text-sm text-text-muted">
                          {t('reports.correctiveAction')}: {i.corrective_action}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {report.notes && (
            <Card>
              <CardHeader title={t('reports.notes')} />
              <p className="whitespace-pre-wrap text-text">{report.notes}</p>
            </Card>
          )}

          {profile && (
            <AttachmentsSection
              reportId={report.id}
              orgId={profile.org.id}
              editable={canWrite && !isSigned}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={t('reports.visitDetails')} />
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label={t('reports.pool')}>
                <Link to={`/pools/${report.pool_id}`} className="text-accent hover:underline">
                  {report.pool?.denominacion ?? '—'}
                </Link>
              </Detail>
              <Detail label={t('reports.basin')}>{report.basin?.denominacion ?? '—'}</Detail>
              <Detail label={t('reports.analysisType')}>
                {t(`analysisType.${report.analysis_type}`)}
              </Detail>
              {report.punto_muestreo != null && (
                <Detail label={t('reports.puntoMuestreo')}>
                  {t(`puntoMuestreo.${report.punto_muestreo}`)}
                </Detail>
              )}
              {report.location_lat != null && report.location_lng != null && (
                <Detail label={t('pools.coordinates')}>
                  <span className="tabular-nums">
                    {report.location_lat}, {report.location_lng}
                  </span>
                </Detail>
              )}
            </dl>
          </Card>

          {isSigned && (
            <Card>
              <h2 className="mb-2 text-base font-semibold text-text">{t('sign.title')}</h2>
              <p className="text-sm text-text">
                {t('sign.signedBy')}: {report.signed_by_name} ({report.signed_by_dni})
              </p>
              {report.signed_at && (
                <p className="text-sm text-text-muted">
                  {t('sign.signedAt')}: {new Date(report.signed_at).toLocaleString('es-ES')}
                </p>
              )}
              {signatureUrl && (
                <img
                  src={signatureUrl}
                  alt={t('sign.title')}
                  className="mt-3 h-32 rounded-[var(--radius-md)] border border-border bg-surface"
                />
              )}
            </Card>
          )}
        </div>
      </div>

      {signing && profile && (
        <SignModal
          reportId={report.id}
          orgId={profile.org.id}
          onClose={() => setSigning(false)}
          onSigned={() => {
            setSigning(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{children}</dd>
    </div>
  );
}

function ReportDetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-8 w-96 max-w-full" />
      <Skeleton className="mb-8 h-4 w-56" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <SkeletonText lines={8} />
        </Card>
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </div>
    </div>
  );
}
