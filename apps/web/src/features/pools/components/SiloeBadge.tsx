import { useTranslation } from 'react-i18next';
import { siloeReadiness, type ReadinessBasin, type ReadinessPool } from '@piscinas/shared';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { madridDateString } from '../../../lib/dashboard.js';

/**
 * Whether the installation is ready for the SILOÉ export, and if not, what is missing. Green
 * only when the installation and every active vaso have codes (the XML needs all of them).
 * The text carries the reason, so it is readable without hovering; the Vasos tab names each
 * vaso without a code.
 */
export function SiloeBadge({
  pool,
  basins,
}: {
  pool: ReadinessPool;
  basins: readonly ReadinessBasin[];
}) {
  const { t } = useTranslation();
  const r = siloeReadiness(pool, basins, madridDateString());
  if (r.ready) return <StatusPill tone="green">{t('pools.siloe.ready')}</StatusPill>;
  const count = r.basinsMissingCode.length;
  const label = r.noActiveBasins
    ? t('pools.siloe.noBasins')
    : r.missingPoolCode && count > 0
      ? t('pools.siloe.missingBoth', { count })
      : r.missingPoolCode
        ? t('pools.siloe.missingPool')
        : t('pools.siloe.missingBasins', { count });
  return <StatusPill tone="amber">{label}</StatusPill>;
}
