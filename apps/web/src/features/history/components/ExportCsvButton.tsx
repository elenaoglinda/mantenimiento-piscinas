import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { groupReadingsByVisit, madridToday, visitsCsv } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { toast } from '../../../components/ui/toast.js';
import { fetchAllVisits, type ParamCatalog, type VisitScope } from '../lib/data.js';

/**
 * "Exportar CSV": every visit matching the current filters (not just the loaded page), one
 * column per parameter, in the format Spanish Excel opens directly (see shared/history).
 */
export function ExportCsvButton({
  scope,
  catalog,
}: {
  scope: VisitScope | null;
  catalog: ParamCatalog | null;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!scope || !catalog) return;
    setBusy(true);
    const { data, failure } = await fetchAllVisits(scope, catalog);
    setBusy(false);
    if (failure) {
      toast(t('history.export.failed'), {
        tone: 'error',
        description: t(`history.db.${failure.code}`, { defaultValue: t('history.db.unknown') }),
      });
      return;
    }
    // Columns: every active parameter, national names, in SILOÉ order — the same layout every
    // time, so a spreadsheet built on one export works with the next.
    const params = [...catalog.forRegion(null).values()].map((d) => ({
      siloeParamId: d.siloe_param_id,
      label: d.unit && d.unit !== 'pH' ? `${d.name_es} (${d.unit})` : d.name_es,
    }));
    const readings = groupReadingsByVisit(
      data.flatMap((v) =>
        v.readings
          .filter((r) => r.siloeParamId != null)
          .map((r) => ({ reportId: v.id, siloeParamId: r.siloeParamId!, value: r.value })),
      ),
    );
    const csv = visitsCsv(
      data.map((v) => ({
        id: v.id,
        visitedAt: v.visitedAt,
        clientName: v.clientName,
        poolName: v.poolName,
        basinName: v.basinName,
        technicianName: v.technicianName,
        statusLabel: t(`reportStatus.${v.status}`),
        incidentCount: v.incidents.length,
        openIncidentCount: v.incidents.filter((i) => i.open).length,
      })),
      readings,
      params,
      {
        date: t('history.export.date'),
        time: t('history.export.time'),
        client: t('pools.client'),
        pool: t('reports.pool'),
        basin: t('reports.basin'),
        technician: t('history.filters.technician'),
        status: t('reports.statusFilter'),
        incidents: t('reports.incidents'),
        openIncidents: t('history.client.openIncidents'),
      },
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitas-${madridToday()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('history.export.done', { count: data.length }));
  }

  return (
    <Button
      variant="secondary"
      loading={busy}
      disabled={!scope || !catalog}
      onClick={() => void run()}
    >
      <Download aria-hidden size={16} />
      {t('history.export.action')}
    </Button>
  );
}
