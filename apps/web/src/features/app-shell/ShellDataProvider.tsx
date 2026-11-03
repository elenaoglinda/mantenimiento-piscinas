import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatInvoiceNumber } from '@piscinas/shared';
import { supabase } from '../../lib/supabase.js';
import { ACTIVITY_WINDOW_DAYS } from '../../lib/dashboard.js';
import { needingAttention } from '../invoicing/data.js';
import { historyLink } from '../history/index.js';
import {
  EMPTY_SHELL_DATA,
  ShellDataContext,
  type ShellAlert,
  type ShellData,
} from './shellData.js';

/**
 * Loads the few numbers the shell shows everywhere — alerts for the bell, counts for the
 * sidebar — and refreshes them on navigation, so saving a report or sending an invoice is
 * reflected as soon as you move on. Read-only queries on existing tables and RPCs; a failure
 * just leaves the previous values (the shell never blocks a page on these).
 */
export function ShellDataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [data, setData] = useState<ShellData>(EMPTY_SHELL_DATA);

  useEffect(() => {
    let active = true;
    const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString();
    void (async () => {
      const [drafts, red, attention] = await Promise.all([
        supabase.from('report').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
        supabase.from('measurement').select('report_id').eq('status', 'red'),
        needingAttention(),
      ]);

      const redIds = [
        ...new Set(((red.data ?? []) as { report_id: string }[]).map((m) => m.report_id)),
      ];
      const attentionRows = attention.data;
      const [reports, invoices] = await Promise.all([
        redIds.length
          ? supabase
              .from('report')
              .select(
                'id, pool_id, visited_at, pool!report_pool_id_org_id_fkey(denominacion), basin!report_basin_id_org_id_fkey(denominacion)',
              )
              .in('id', redIds)
              .gte('visited_at', cutoff)
              .order('visited_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),
        attentionRows.length
          ? supabase
              .from('invoice')
              .select(
                'id, number, client!invoice_client_id_org_id_fkey(name), invoice_series!invoice_series_id_org_id_fkey(code)',
              )
              .in(
                'id',
                attentionRows.map((a) => a.invoice_id),
              )
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;

      type R = {
        id: string;
        pool_id: string;
        visited_at: string;
        pool: { denominacion: string } | null;
        basin: { denominacion: string } | null;
      };
      type I = {
        id: string;
        number: number | null;
        client: { name: string } | null;
        invoice_series: { code: string } | null;
      };
      const invoiceById = new Map(((invoices.data ?? []) as I[]).map((i) => [i.id, i]));
      const alerts: ShellAlert[] = [
        ...((reports.data ?? []) as R[]).map((r) => ({
          id: `reading-${r.id}`,
          kind: 'reading' as const,
          title: [r.pool?.denominacion, r.basin?.denominacion].filter(Boolean).join(' · '),
          detail: `${t('dashboard.outOfRangeReading')} · ${new Date(r.visited_at).toLocaleDateString('es-ES')}`,
          to: historyLink(r.pool_id, r.id),
        })),
        ...attentionRows.map((a) => {
          const inv = invoiceById.get(a.invoice_id);
          return {
            id: `invoice-${a.invoice_id}`,
            kind: 'invoice' as const,
            title: [
              inv ? formatInvoiceNumber(inv.invoice_series?.code ?? '', inv.number) : null,
              inv?.client?.name,
            ]
              .filter(Boolean)
              .join(' · '),
            detail: t(`invoicing.resumen.reason.${a.reason}`, { defaultValue: a.reason }),
            to: `/invoices/${a.invoice_id}`,
          };
        }),
      ];
      setData({
        alerts,
        draftReports: drafts.count ?? 0,
        invoiceAttention: attentionRows.length,
      });
    })();
    return () => {
      active = false;
    };
  }, [pathname, t]);

  return <ShellDataContext.Provider value={data}>{children}</ShellDataContext.Provider>;
}
