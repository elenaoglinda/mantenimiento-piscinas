import {
  aggregateParameter,
  PARAMETROS_BY_ID,
  formatSpanishDate,
  type DailyMeasurement,
  type XmlMuestreo,
  type XmlMvaso,
} from '@piscinas/shared';
import { supabase } from './supabase.js';
import type { Enums } from './database.types.js';

type AnalysisType = Enums<'analysis_type'>;

function mode(nums: number[], fallback: number): number {
  if (nums.length === 0) return fallback;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Aggregate the season's measurements into annual_result(+param) rows for every basin that has
 * completed/signed reports in `year`. Overwrites any previous draft for that basin/year/type
 * (regenerating recomputes). Returns how many basins were produced. (Phase 5.2/5.3)
 */
export async function generateAnnualResults(
  orgId: string,
  year: number,
  analysisType: AnalysisType,
): Promise<{ basins: number }> {
  const { data: reports } = await supabase
    .from('report')
    .select('id, basin_id, visited_at, punto_muestreo')
    .gte('visited_at', `${year}-01-01`)
    .lte('visited_at', `${year}-12-31T23:59:59`)
    .eq('analysis_type', analysisType)
    .in('status', ['completed', 'signed']);

  if (!reports || reports.length === 0) return { basins: 0 };

  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const { data: meas } = await supabase
    .from('measurement')
    .select('report_id, value, compliant, lugar, parameter_def(siloe_param_id)')
    .in(
      'report_id',
      reports.map((r) => r.id),
    );

  interface ParamAcc {
    lugars: number[];
    days: DailyMeasurement[];
  }
  interface BasinAcc {
    puntos: number[];
    dates: string[];
    params: Map<number, ParamAcc>;
  }
  const byBasin = new Map<string, BasinAcc>();

  for (const m of meas ?? []) {
    const rep = reportMap.get(m.report_id);
    const siloeParam = (m.parameter_def as { siloe_param_id: number } | null)?.siloe_param_id;
    if (!rep || siloeParam == null || m.value == null) continue;
    const day = rep.visited_at.slice(0, 10);
    const acc: BasinAcc = byBasin.get(rep.basin_id) ?? { puntos: [], dates: [], params: new Map() };
    acc.puntos.push(rep.punto_muestreo ?? 2);
    acc.dates.push(day);
    const pacc: ParamAcc = acc.params.get(siloeParam) ?? { lugars: [], days: [] };
    pacc.lugars.push(m.lugar === 'lab' ? 2 : 1);
    pacc.days.push({ day, value: Number(m.value), compliant: !!m.compliant });
    acc.params.set(siloeParam, pacc);
    byBasin.set(rep.basin_id, acc);
  }

  for (const [basinId, acc] of byBasin) {
    const sortedDates = [...new Set(acc.dates)].sort();
    const fechaApertura = sortedDates[0];
    const fechaCierre = sortedDates[sortedDates.length - 1];
    const dias =
      Math.round((new Date(fechaCierre).getTime() - new Date(fechaApertura).getTime()) / 86400000) +
      1;

    const { data: ar } = await supabase
      .from('annual_result')
      .upsert(
        {
          org_id: orgId,
          basin_id: basinId,
          year,
          analysis_type: analysisType,
          fecha_apertura: fechaApertura,
          fecha_cierre: fechaCierre,
          dias_apertura: dias,
          n_rutina: sortedDates.length,
          punto_muestreo: mode(acc.puntos, 2),
        },
        { onConflict: 'basin_id,year,analysis_type' },
      )
      .select('id')
      .single();
    if (!ar) continue;

    await supabase.from('annual_result_param').delete().eq('annual_result_id', ar.id);
    const paramRows = [...acc.params.entries()].map(([siloeParam, pacc]) => {
      const agg = aggregateParameter(pacc.days);
      const def = PARAMETROS_BY_ID.get(siloeParam);
      return {
        org_id: orgId,
        annual_result_id: ar.id,
        siloe_param_id: siloeParam,
        id_lugar: mode(pacc.lugars, 1),
        id_metodo: def?.allowedMetodo[0] ?? 14,
        deter: agg.deter,
        deter_c: agg.deterC,
        dias_nc: agg.diasNc,
        vc_med: agg.vcMed,
        vc_min: agg.vcMin,
        vc_max: agg.vcMax,
      };
    });
    if (paramRows.length) await supabase.from('annual_result_param').insert(paramRows);
  }

  return { basins: byBasin.size };
}

export interface ExportBuild {
  muestreos: XmlMuestreo[];
  arCount: number;
}

/**
 * Assemble the SILOE `muestreos` payload from stored annual_result rows, grouped by pool
 * (cod_seguridad = pool.siloe_cod_p, cod_v = basin.siloe_cod_v). (Phase 5.4)
 */
export async function buildExport(year: number, analysisType: AnalysisType): Promise<ExportBuild> {
  const { data: ars } = await supabase
    .from('annual_result')
    .select(
      '*, basin!annual_result_basin_id_org_id_fkey(siloe_cod_v, pool!basin_pool_id_org_id_fkey(siloe_cod_p))',
    )
    .eq('year', year)
    .eq('analysis_type', analysisType);

  if (!ars || ars.length === 0) return { muestreos: [], arCount: 0 };

  const { data: params } = await supabase
    .from('annual_result_param')
    .select('*')
    .in(
      'annual_result_id',
      ars.map((a) => a.id),
    );
  const paramsByAr = new Map<string, NonNullable<typeof params>>();
  for (const p of params ?? []) {
    const list = paramsByAr.get(p.annual_result_id) ?? [];
    list.push(p);
    paramsByAr.set(p.annual_result_id, list);
  }

  const tipoAnalisis = analysisType === 'autocontrol' ? 1 : 2;
  const muestreos = new Map<string, XmlMuestreo>();

  for (const ar of ars) {
    const basin = ar.basin as {
      siloe_cod_v: string | null;
      pool: { siloe_cod_p: string | null } | null;
    } | null;
    const codSeguridad = basin?.pool?.siloe_cod_p ?? '';
    let muestreo = muestreos.get(codSeguridad);
    if (!muestreo) {
      muestreo = {
        codSeguridad,
        annio: String(year),
        laboratorio: ar.laboratorio ?? '',
        mvasos: [],
      };
      muestreos.set(codSeguridad, muestreo);
    }
    if (!muestreo.laboratorio && ar.laboratorio) muestreo.laboratorio = ar.laboratorio;

    const mvaso: XmlMvaso = {
      codV: basin?.siloe_cod_v ?? '',
      cInicial: ar.n_iniciales,
      cRutina: ar.n_rutina,
      cPeriodico: ar.n_periodicos,
      cVigilancia: ar.n_vigilancia ?? undefined,
      idPm: ar.punto_muestreo,
      idTipoAnalisis: tipoAnalisis,
      fechaA: ar.fecha_apertura ? formatSpanishDate(ar.fecha_apertura) : '',
      fechaC: ar.fecha_cierre ? formatSpanishDate(ar.fecha_cierre) : '',
      numDiasAp: ar.dias_apertura ?? 0,
      parametros: (paramsByAr.get(ar.id) ?? []).map((p) => ({
        idParametro: p.siloe_param_id,
        diasNc: p.dias_nc,
        deter: p.deter,
        deterC: p.deter_c,
        idLugar: p.id_lugar,
        idMetodo: p.id_metodo,
        vcMed: p.vc_med ?? 0,
        vcMin: p.vc_min ?? 0,
        vcMax: p.vc_max ?? 0,
      })),
    };
    muestreo.mvasos.push(mvaso);
  }

  return { muestreos: [...muestreos.values()], arCount: ars.length };
}
