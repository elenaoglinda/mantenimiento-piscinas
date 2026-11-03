import { useTranslation } from 'react-i18next';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { useVisitLogs } from '../lib/useVisitLogs.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';
import { VisitLogDetails } from './VisitLogDetails.js';

/** Report detail: what was done at the visit (products added, tasks). Hidden when empty. */
export function ReportServiceLogCard({ reportId }: { reportId: string }) {
  const { t } = useTranslation();
  const { logs, failure, logOf } = useVisitLogs([reportId]);
  if (failure)
    return (
      <Card>
        <CardHeader title={t('serviceLog.title')} />
        <ServiceLogAlert failure={failure} />
      </Card>
    );
  const log = logOf(reportId);
  if (!logs || (log.products.length === 0 && log.tasks.length === 0)) return null;
  return (
    <Card>
      <CardHeader title={t('serviceLog.title')} />
      <div className="flex flex-col gap-4">
        <VisitLogDetails log={log} headingLevel={3} />
      </div>
    </Card>
  );
}
