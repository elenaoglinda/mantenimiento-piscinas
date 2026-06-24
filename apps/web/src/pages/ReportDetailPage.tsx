import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { StatusChip } from '../components/ui/StatusChip.js';
import { ReportStatusBadge } from '../components/ReportStatusBadge.js';
import { SignModal } from '../components/SignModal.js';
import { AttachmentsSection } from '../components/AttachmentsSection.js';
import type { Tables } from '../lib/database.types.js';

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

  if (loading) return <Spinner />;
  if (error || !report) return <Alert tone="error">{error ?? t('common.genericError')}</Alert>;

  const isSigned = report.status === 'signed';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link to="/reports" className="text-sm text-primary hover:underline">
          ← {t('nav.reports')}
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          {canWrite && !isSigned && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/reports/${report.id}/edit`)}>
                {t('common.edit')}
              </Button>
              {report.status === 'completed' && (
                <Button onClick={() => setSigning(true)}>{t('reports.signAction')}</Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            {report.pool?.denominacion} · {report.basin?.denominacion}
          </h1>
          <p className="text-sm text-text-muted">
            {new Date(report.visited_at).toLocaleString('es-ES')} ·{' '}
            {t(`analysisType.${report.analysis_type}`)}
          </p>
        </div>
        <ReportStatusBadge status={report.status} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-text">{t('reports.parameters')}</h2>
        {measurements.length === 0 ? (
          <p className="text-sm text-text-muted">{t('common.none')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text">
                    {m.parameter_def?.name_es ?? '—'}
                    {m.parameter_def?.unit && (
                      <span className="ml-1 text-xs text-text-muted">({m.parameter_def.unit})</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-text">{m.value ?? '—'}</td>
                  <td className="py-2 text-xs text-text-muted">{t(`lugar.${m.lugar}`)}</td>
                  <td className="py-2 text-right">
                    <StatusChip status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {incidents.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-text">{t('reports.incidents')}</h2>
          <ul className="flex flex-col gap-3">
            {incidents.map((i) => (
              <li key={i.id} className="border-l-2 border-status-amber pl-3">
                <p className="text-text">{i.description}</p>
                {i.corrective_action && (
                  <p className="text-sm text-text-muted">
                    {t('reports.correctiveAction')}: {i.corrective_action}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report.notes && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-text">{t('reports.notes')}</h2>
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

      {isSigned && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-text">{t('sign.title')}</h2>
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
