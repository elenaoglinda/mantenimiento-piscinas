import { useTranslation } from 'react-i18next';
import type { ParameterStatus } from '@piscinas/shared';
import { StatusPill } from '../../../components/ui/StatusPill.js';

/**
 * The light of a reading outside SILOÉ. Same colours as StatusChip, different words: there is no
 * legal limit for alkalinity, hardness, salt or phosphates, only a recommended range.
 */
export function RecommendedChip({ status }: { status: ParameterStatus }) {
  const { t } = useTranslation();
  return <StatusPill tone={status}>{t(`serviceLog.params.status.${status}`)}</StatusPill>;
}
