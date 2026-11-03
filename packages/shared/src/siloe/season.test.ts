import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatSpanishDate, buildAnnualResultsXml, type XmlMuestreo } from './xml.js';
import { summarizeSeason, type SeasonMeasurement, type SeasonReport } from './season.js';

/**
 * The SILOE annual-results XML must not change when Cloro starts recording things SILOE
 * doesn't ask for (products, tasks, alkalinity, hardness, salt, phosphates). These tests pin
 * the XML for a fixed season byte for byte, and show that adding non-SILOE readings to the
 * same season produces exactly the same bytes.
 */

const reports: SeasonReport[] = [
  { id: 'r1', basin_id: 'b1', visited_at: '2025-06-02T08:00:00Z', punto_muestreo: 2 },
  { id: 'r2', basin_id: 'b1', visited_at: '2025-06-02T17:30:00Z', punto_muestreo: 2 },
  { id: 'r3', basin_id: 'b1', visited_at: '2025-06-03T09:00:00Z', punto_muestreo: 1 },
  { id: 'r4', basin_id: 'b2', visited_at: '2025-06-05T10:00:00Z', punto_muestreo: null },
  { id: 'r5', basin_id: 'b1', visited_at: '2025-07-01T09:00:00Z', punto_muestreo: 2 },
];

const siloe = (id: number) => ({ siloe_param_id: id, in_siloe: true });
const m = (
  report_id: string,
  param: SeasonMeasurement['parameter_def'],
  value: number | null,
  compliant: boolean,
  lugar: 'in_situ' | 'lab' = 'in_situ',
): SeasonMeasurement => ({ report_id, value, compliant, lugar, parameter_def: param });

const siloeReadings: SeasonMeasurement[] = [
  m('r1', siloe(1), 7.4, true),
  m('r1', siloe(10), 1.2, true),
  m('r2', siloe(1), 8.3, false),
  m('r2', siloe(10), 0.4, false),
  m('r3', siloe(1), 7.6, true),
  m('r3', siloe(9), 0.3, true),
  m('r4', siloe(1), 7.2, true),
  m('r4', siloe(3), 27.5, true),
  m('r5', siloe(11), 0, true, 'lab'),
  m('r5', siloe(10), null, false), // empty readings never count
  // Rows from before the in_siloe column existed have no flag: still SILOE.
  m('r5', { siloe_param_id: 1 }, 7.5, true),
];

/** Readings outside SILOE, on the same visits. They must change nothing. */
const extraReadings: SeasonMeasurement[] = [
  m('r1', { siloe_param_id: null, in_siloe: false }, 95, true), // alcalinidad
  m('r2', { siloe_param_id: null, in_siloe: false }, 310, true), // dureza
  m('r3', { siloe_param_id: null, in_siloe: false }, 4.1, true), // sal
  m('r4', { siloe_param_id: null, in_siloe: false }, 0.3, false), // fosfatos, out of range
  m('r5', { siloe_param_id: 7, in_siloe: false }, 50, true), // defensive: flag wins
  m('r9', siloe(1), 7.0, true), // a reading of a visit outside the season
];

/** The same mapping buildExport() makes from the stored rows (apps/web/src/lib/siloeExport.ts). */
function seasonXml(measurements: SeasonMeasurement[]): string {
  const season = summarizeSeason(reports, measurements);
  const codV: Record<string, string> = { b1: 'V-001', b2: 'V-002' };
  const muestreo: XmlMuestreo = {
    codSeguridad: 'P-29069-001',
    annio: '2025',
    laboratorio: 'LAB-0001',
    mvasos: [...season.entries()].map(([basinId, s]) => ({
      codV: codV[basinId],
      cInicial: 0,
      cRutina: s.n_rutina,
      cPeriodico: 0,
      cVigilancia: undefined,
      idPm: s.punto_muestreo,
      idTipoAnalisis: 1,
      fechaA: formatSpanishDate(s.fecha_apertura),
      fechaC: formatSpanishDate(s.fecha_cierre),
      numDiasAp: s.dias_apertura,
      parametros: s.params.map((p) => ({
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
    })),
  };
  return buildAnnualResultsXml([muestreo]);
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('SILOE XML is unaffected by readings outside SILOE', () => {
  it('pins the XML for a fixed season (golden)', () => {
    const xml = seasonXml(siloeReadings);
    expect(xml).toBe(GOLDEN_XML);
    expect(sha256(xml)).toBe(GOLDEN_SHA256);
  });

  it('is byte-identical when non-SILOE readings are added to the same visits', () => {
    const plain = seasonXml(siloeReadings);
    const mixed = seasonXml([
      ...extraReadings.slice(0, 3),
      ...siloeReadings,
      ...extraReadings.slice(3),
    ]);
    expect(sha256(mixed)).toBe(sha256(plain));
    expect(mixed).toBe(plain);
  });

  it('keeps out a parameter marked in_siloe = false even if it has a SILOE id', () => {
    const season = summarizeSeason(reports, [...siloeReadings, ...extraReadings]);
    const ids = [...season.values()].flatMap((b) => b.params.map((p) => p.siloe_param_id));
    expect(ids).not.toContain(7);
  });
});

// Captured with a verbatim copy of the export pipeline as it was before this change
// (generateAnnualResults + buildExport at claude/service-history), for the readings above.
// Dates are formatted in the process's timezone, as in the app; CI runs in UTC.
const GOLDEN_SHA256 = '82d68ea8e23905f1b9c4ac540a07c5d5bf4d937870af7aebdf9892a6c3f27de8';
const GOLDEN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<muestreos xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="altaMuestra.xsd">
    <muestreo>
      <cod_seguridad>P-29069-001</cod_seguridad>
      <annio>2025</annio>
      <laboratorio>LAB-0001</laboratorio>
      <mvasos>
        <mvaso>
          <cod_v>V-001</cod_v>
          <c_inicial_v>0</c_inicial_v>
          <c_rutina_v>3</c_rutina_v>
          <c_periodico_v>0</c_periodico_v>
          <id_pm>2</id_pm>
          <id_tipo_analisis>1</id_tipo_analisis>
          <fecha_a>02/06/2025</fecha_a>
          <fecha_c>01/07/2025</fecha_c>
          <numdiasAp>30</numdiasAp>
          <parametros>
          <parametro>
            <id_parametro>1</id_parametro>
            <dias_nc>1</dias_nc>
            <deter>4</deter>
            <deter_c>3</deter_c>
            <idLugar>1</idLugar>
            <idMetodo>1</idMetodo>
            <vc_med>7.65</vc_med>
            <vc_min>7.4</vc_min>
            <vc_max>8.3</vc_max>
          </parametro>
          <parametro>
            <id_parametro>10</id_parametro>
            <dias_nc>1</dias_nc>
            <deter>2</deter>
            <deter_c>1</deter_c>
            <idLugar>1</idLugar>
            <idMetodo>2</idMetodo>
            <vc_med>0.8</vc_med>
            <vc_min>0.4</vc_min>
            <vc_max>1.2</vc_max>
          </parametro>
          <parametro>
            <id_parametro>9</id_parametro>
            <dias_nc>0</dias_nc>
            <deter>1</deter>
            <deter_c>1</deter_c>
            <idLugar>1</idLugar>
            <idMetodo>2</idMetodo>
            <vc_med>0.3</vc_med>
            <vc_min>0.3</vc_min>
            <vc_max>0.3</vc_max>
          </parametro>
          <parametro>
            <id_parametro>11</id_parametro>
            <dias_nc>0</dias_nc>
            <deter>1</deter>
            <deter_c>1</deter_c>
            <idLugar>2</idLugar>
            <idMetodo>8</idMetodo>
            <vc_med>0</vc_med>
            <vc_min>0</vc_min>
            <vc_max>0</vc_max>
          </parametro>
          </parametros>
        </mvaso>
        <mvaso>
          <cod_v>V-002</cod_v>
          <c_inicial_v>0</c_inicial_v>
          <c_rutina_v>1</c_rutina_v>
          <c_periodico_v>0</c_periodico_v>
          <id_pm>2</id_pm>
          <id_tipo_analisis>1</id_tipo_analisis>
          <fecha_a>05/06/2025</fecha_a>
          <fecha_c>05/06/2025</fecha_c>
          <numdiasAp>1</numdiasAp>
          <parametros>
          <parametro>
            <id_parametro>1</id_parametro>
            <dias_nc>0</dias_nc>
            <deter>1</deter>
            <deter_c>1</deter_c>
            <idLugar>1</idLugar>
            <idMetodo>1</idMetodo>
            <vc_med>7.2</vc_med>
            <vc_min>7.2</vc_min>
            <vc_max>7.2</vc_max>
          </parametro>
          <parametro>
            <id_parametro>3</id_parametro>
            <dias_nc>0</dias_nc>
            <deter>1</deter>
            <deter_c>1</deter_c>
            <idLugar>1</idLugar>
            <idMetodo>3</idMetodo>
            <vc_med>27.5</vc_med>
            <vc_min>27.5</vc_min>
            <vc_max>27.5</vc_max>
          </parametro>
          </parametros>
        </mvaso>
      </mvasos>
    </muestreo>
</muestreos>
`;
