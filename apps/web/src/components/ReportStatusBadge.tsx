import { useTranslation } from 'react-i18next';
import { StatusPill } from './ui/StatusPill.js';
import type { Tone } from './ui/variants.js';
import type { Enums } from '../lib/database.types.js';

const tones: Record<Enums<'report_status'>, Tone> = {
  draft: 'neutral',
  completed: 'amber',
  signed: 'green',
};

export function ReportStatusBadge({ status }: { status: Enums<'report_status'> }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={tones[status]} className="shrink-0">
      {t(`reportStatus.${status}`)}
    </StatusPill>
  );
}
