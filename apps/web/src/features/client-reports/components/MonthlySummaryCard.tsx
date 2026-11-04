import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { monthLabelEs, recentMonths } from '@piscinas/shared';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Alert } from '../../../components/ui/feedback.js';
import { Select } from '../../../components/ui/Select.js';
import { useAuth } from '../../../auth/context.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { fetchPoolClientContact, type ClientContact } from '../lib/data.js';
import { ShareActions } from './ShareActions.js';

/**
 * Pool page: pick a month, get the monthly summary PDF for the client (trends, visits, out of
 * range readings, incidents, products used per vaso) and send it.
 */
export function MonthlySummaryCard({ poolId, poolName }: { poolId: string; poolName: string }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const months = useMemo(() => recentMonths(12), []);
  const [month, setMonth] = useState(months[0]!);
  const [contact, setContact] = useState<ClientContact | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPoolClientContact(poolId).then(({ data, failure }) => {
      if (!active) return;
      setContact(data);
      setFailure(failure);
    });
    return () => {
      active = false;
    };
  }, [poolId]);

  const company = profile?.org.name ?? '';
  const label = monthLabelEs(month);

  return (
    <Card>
      <CardHeader
        title={t('clientReports.monthly.title')}
        description={t('clientReports.monthly.hint')}
      />
      {failure && (
        <Alert tone="error" className="mb-3">
          {t('clientReports.errors.contact')}
        </Alert>
      )}
      <div className="mb-3 flex flex-col gap-1.5">
        <label htmlFor="monthly-summary-month" className="text-sm font-medium text-text">
          {t('clientReports.monthly.month')}
        </label>
        <Select
          id="monthly-summary-month"
          value={month}
          onValueChange={setMonth}
          className="w-full sm:w-64"
          options={months.map((m) => ({ value: m, label: capitalise(monthLabelEs(m)) }))}
        />
      </div>
      <ShareActions
        request={{ kind: 'monthly', poolId, month }}
        contact={contact}
        messages={(link, expires) => {
          const vars = { pool: poolName, month: label, url: link.url, expires, company };
          return {
            subject: t('clientReports.email.monthlySubject', vars),
            body: t('clientReports.email.monthlyBody', vars),
            whatsapp: t('clientReports.whatsapp.monthly', vars),
          };
        }}
      />
    </Card>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
