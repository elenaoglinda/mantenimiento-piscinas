import {
  formatSpanishDate,
  summarizeSeason,
  type SeasonMeasurement,
  type XmlMuestreo,
  type XmlMvaso,
} from '@piscinas/shared';
import { supabase } from './supabase.js';
import type { Enums } from './database.types.js';

type AnalysisType = Enums<'analysis_type'>;

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

  const { data: meas } = await supabase
    .from('measurement')
    // parameter_def(*) rather than naming in_siloe: works before and after the migration that
    // adds it (rows without the flag count as SILOE, as they always did).
    .select('report_id, value, compliant, lugar, parameter_def(*)')
    .in(
      'report_id',
      reports.map((r) => r.id),
    );

  // Grouping and aggregation live in @piscinas/shared (siloe/season.ts), pinned by a
  // byte-for-byte XML test; readings of parameters outside SILOE are dropped there.
  const season = summarizeSeason(reports, (meas ?? []) as unknown as SeasonMeasurement[]);

  for (const [basinId, s] of season) {
    const { data: ar } = await supabase
      .from('annual_result')
      .upsert(
        {
          org_id: orgId,
          basin_id: basinId,
          year,
          analysis_type: analysisType,
          fecha_apertura: s.fecha_apertura,
          fecha_cierre: s.fecha_cierre,
          dias_apertura: s.dias_apertura,
          n_rutina: s.n_rutina,
          punto_muestreo: s.punto_muestreo,
        },
        { onConflict: 'basin_id,year,analysis_type' },
      )
      .select('id')
      .single();
    if (!ar) continue;

    await supabase.from('annual_result_param').delete().eq('annual_result_id', ar.id);
    const paramRows = s.params.map((p) => ({ org_id: orgId, annual_result_id: ar.id, ...p }));
    if (paramRows.length) await supabase.from('annual_result_param').insert(paramRows);
  }

  return { basins: season.size };
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
