import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Alert } from '../../../components/ui/feedback.js';
import { useAuth } from '../../../auth/context.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchPoolClientContact, type ClientContact } from '../lib/data.js';
import { ShareActions } from './ShareActions.js';

const dateFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * On a completed or signed report: the PDF for the pool's client, and the buttons that send
 * it. Drafts get nothing — a client should never receive an unfinished visit.
 */
export function SendVisitReportCard({
  report,
}: {
  report: {
    id: string;
    pool_id: string;
    status: 'draft' | 'completed' | 'signed';
    visited_at: string;
    poolName: string;
    basinName: string;
  };
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [contact, setContact] = useState<ClientContact | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPoolClientContact(report.pool_id).then(({ data, failure }) => {
      if (!active) return;
      setContact(data);
      setFailure(failure);
    });
    return () => {
      active = false;
    };
  }, [report.pool_id]);

  if (report.status === 'draft') return null;
  const date = dateFmt.format(new Date(report.visited_at));
  const company = profile?.org.name ?? '';

  return (
    <Card className="print:hidden">
      <CardHeader
        title={t('clientReports.share.title')}
        description={t('clientReports.share.visitHint')}
      />
      {failure && (
        <Alert tone="error" className="mb-3">
          {t('clientReports.errors.contact')}
        </Alert>
      )}
      {report.status === 'completed' && (
        <p className="mb-3 text-sm text-text-muted">{t('clientReports.share.unsigned')}</p>
      )}
      <ShareActions
        request={{ kind: 'visit', reportId: report.id }}
        contact={contact}
        messages={(link, expires) => {
          const vars = {
            pool: report.poolName,
            basin: report.basinName,
            date,
            url: link.url,
            expires,
            company,
          };
          return {
            subject: t('clientReports.email.visitSubject', vars),
            body: t('clientReports.email.visitBody', vars),
            whatsapp: t('clientReports.whatsapp.visit', vars),
          };
        }}
      />
    </Card>
  );
}
