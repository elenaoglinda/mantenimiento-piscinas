/**
 * SILOE annual-results XML builder + pre-flight validator.
 * Element names/order follow the official XSD (Anexo_CargaXML_Result_Anual v1.4); the validator
 * mirrors SILOE's documented COD_ERROR rules so exports don't bounce. See spec §5.2 / Appendix A.
 */

export interface XmlParametro {
  idParametro: number;
  diasNc: number;
  deter: number;
  deterC: number;
  idLugar: number;
  idMetodo: number;
  vcMed: number;
  vcMin: number;
  vcMax: number;
}

export interface XmlPerApertura {
  fechaA: string; // dd/mm/yyyy
  fechaC: string; // dd/mm/yyyy
  numDias: number;
  observCierre?: string;
  idMotivo: number;
}

export interface XmlMvaso {
  codV: string;
  cInicial: number;
  cRutina: number;
  cPeriodico: number;
  cVigilancia?: number;
  idPm: number;
  idTipoAnalisis: number;
  fechaA: string; // dd/mm/yyyy
  fechaC: string; // dd/mm/yyyy
  numDiasAp: number;
  peraperturas?: XmlPerApertura[];
  parametros: XmlParametro[];
}

export interface XmlMuestreo {
  codSeguridad: string;
  annio: string;
  observaciones?: string;
  laboratorio: string;
  mvasos: XmlMvaso[];
}

export interface ValidationError {
  code: string;
  message: string;
  context?: string;
}

const SPANISH_DATE = /^[0-3][0-9]\/[0-1][0-9]\/[0-9]{4}$/;

/** Format a Date (or ISO string) as SILOE's dd/mm/yyyy. */
export function formatSpanishDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function yearOf(date: string): string {
  return date.slice(6, 10);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a decimal for the sample_comma type: up to 2 decimals, dot separator, no trailing zeros. */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
function buildParametro(p: XmlParametro): string {
  return [
    '          <parametro>',
    `            <id_parametro>${p.idParametro}</id_parametro>`,
    `            <dias_nc>${p.diasNc}</dias_nc>`,
    `            <deter>${p.deter}</deter>`,
    `            <deter_c>${p.deterC}</deter_c>`,
    `            <idLugar>${p.idLugar}</idLugar>`,
    `            <idMetodo>${p.idMetodo}</idMetodo>`,
    `            <vc_med>${num(p.vcMed)}</vc_med>`,
    `            <vc_min>${num(p.vcMin)}</vc_min>`,
    `            <vc_max>${num(p.vcMax)}</vc_max>`,
    '          </parametro>',
  ].join('\n');
}

function buildPerApertura(p: XmlPerApertura): string {
  return [
    '            <perapertura>',
    `              <per_fecha_a>${p.fechaA}</per_fecha_a>`,
    `              <per_fecha_c>${p.fechaC}</per_fecha_c>`,
    `              <per_numdiasAp>${p.numDias}</per_numdiasAp>`,
    `              <per_observCierre>${esc(p.observCierre ?? '')}</per_observCierre>`,
    `              <per_id_cmotivo>${p.idMotivo}</per_id_cmotivo>`,
    '            </perapertura>',
  ].join('\n');
}

function buildMvaso(v: XmlMvaso): string {
  const lines = [
    '        <mvaso>',
    `          <cod_v>${esc(v.codV)}</cod_v>`,
    `          <c_inicial_v>${v.cInicial}</c_inicial_v>`,
    `          <c_rutina_v>${v.cRutina}</c_rutina_v>`,
    `          <c_periodico_v>${v.cPeriodico}</c_periodico_v>`,
  ];
  if (v.cVigilancia != null)
    lines.push(`          <c_vigilancia_v>${v.cVigilancia}</c_vigilancia_v>`);
  lines.push(
    `          <id_pm>${v.idPm}</id_pm>`,
    `          <id_tipo_analisis>${v.idTipoAnalisis}</id_tipo_analisis>`,
    `          <fecha_a>${v.fechaA}</fecha_a>`,
    `          <fecha_c>${v.fechaC}</fecha_c>`,
    `          <numdiasAp>${v.numDiasAp}</numdiasAp>`,
  );
  if (v.peraperturas && v.peraperturas.length > 0) {
    lines.push('          <peraperturas>');
    for (const p of v.peraperturas) lines.push(buildPerApertura(p));
    lines.push('          </peraperturas>');
  }
  lines.push('          <parametros>');
  for (const p of v.parametros) lines.push(buildParametro(p));
  lines.push('          </parametros>', '        </mvaso>');
  return lines.join('\n');
}

function buildMuestreo(m: XmlMuestreo): string {
  const lines = [
    '    <muestreo>',
    `      <cod_seguridad>${esc(m.codSeguridad)}</cod_seguridad>`,
    `      <annio>${esc(m.annio)}</annio>`,
  ];
  if (m.observaciones) lines.push(`      <observaciones>${esc(m.observaciones)}</observaciones>`);
  lines.push(`      <laboratorio>${esc(m.laboratorio)}</laboratorio>`, '      <mvasos>');
  for (const v of m.mvasos) lines.push(buildMvaso(v));
  lines.push('      </mvasos>', '    </muestreo>');
  return lines.join('\n');
}

export function buildAnnualResultsXml(muestreos: XmlMuestreo[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<muestreos xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="altaMuestra.xsd">',
    ...muestreos.map(buildMuestreo),
    '</muestreos>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Validator (mirrors SILOE COD_ERROR rules)
// ---------------------------------------------------------------------------
export function validateAnnualResults(
  muestreos: XmlMuestreo[],
  opts: { currentYear: number },
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const m of muestreos) {
    const where = `vaso(s) de ${m.codSeguridad || '—'}`;
    if (!m.codSeguridad.trim())
      errors.push({
        code: '001',
        message: 'Falta el código de seguridad de la piscina.',
        context: where,
      });
    if (!m.laboratorio.trim())
      errors.push({ code: '207', message: 'Falta el código de laboratorio.', context: where });
    if (!/^[0-9]{4}$/.test(m.annio))
      errors.push({ code: '005', message: 'Año no válido.', context: where });
    else if (Number(m.annio) !== opts.currentYear - 1)
      errors.push({
        code: '201',
        message: 'Solo se pueden enviar muestras del año anterior al actual.',
        context: where,
      });

    for (const v of m.mvasos) {
      const vw = `vaso ${v.codV || '—'}`;
      const dupKey = `${m.codSeguridad}|${v.codV}|${v.idTipoAnalisis}`;
      if (seen.has(dupKey))
        errors.push({
          code: '203',
          message: 'Resultado anual duplicado para el mismo vaso, periodo y tipo de análisis.',
          context: vw,
        });
      seen.add(dupKey);

      if (!v.codV.trim())
        errors.push({ code: '008', message: 'El código del vaso está vacío.', context: vw });
      if (!SPANISH_DATE.test(v.fechaA))
        errors.push({ code: '002', message: 'Fecha de apertura no válida.', context: vw });
      if (!SPANISH_DATE.test(v.fechaC))
        errors.push({ code: '003', message: 'Fecha de cierre no válida.', context: vw });
      if (SPANISH_DATE.test(v.fechaA) && SPANISH_DATE.test(v.fechaC)) {
        if (yearOf(v.fechaA) !== yearOf(v.fechaC))
          errors.push({
            code: '209',
            message: 'Las fechas de apertura y cierre son de años distintos.',
            context: vw,
          });
        const [da, ma, ya] = v.fechaA.split('/').map(Number);
        const [dc, mc, yc] = v.fechaC.split('/').map(Number);
        if (new Date(yc, mc - 1, dc) < new Date(ya, ma - 1, da))
          errors.push({
            code: '004',
            message: 'La fecha de cierre no puede ser anterior a la de apertura.',
            context: vw,
          });
      }
      if (v.numDiasAp == null)
        errors.push({ code: '222', message: 'Faltan los días de apertura.', context: vw });
      else if (v.numDiasAp > 365)
        errors.push({ code: '208', message: 'Los días de apertura superan 365.', context: vw });
      if (v.cInicial > 20)
        errors.push({ code: '273', message: 'Nº de controles iniciales supera 20.', context: vw });
      if (v.cRutina > 1500)
        errors.push({
          code: '287',
          message: 'Nº de controles de rutina supera 1500.',
          context: vw,
        });
      if (v.cPeriodico > 20)
        errors.push({ code: '289', message: 'Nº de controles periódicos supera 20.', context: vw });
      if (v.parametros.length === 0)
        errors.push({
          code: '204',
          message: 'Debe incluir al menos un parámetro analizado.',
          context: vw,
        });

      if (v.peraperturas && v.peraperturas.length > 0) {
        const sum = v.peraperturas.reduce((a, p) => a + p.numDias, 0);
        if (sum !== v.numDiasAp)
          errors.push({
            code: '291',
            message: 'La suma de días de los periodos no coincide con los días de apertura.',
            context: vw,
          });
      }

      for (const p of v.parametros) {
        const pw = `${vw}, parámetro ${p.idParametro}`;
        if (p.deterC > p.deter)
          errors.push({
            code: '236',
            message: 'Nº de conformes no puede superar el nº de determinaciones.',
            context: pw,
          });
        if (p.diasNc > v.numDiasAp)
          errors.push({
            code: '237',
            message: 'Días de incumplimiento no pueden superar los días de apertura.',
            context: pw,
          });
        if (p.vcMax < p.vcMin)
          errors.push({
            code: '206',
            message: 'El valor máximo debe ser mayor o igual que el mínimo.',
            context: pw,
          });
      }
    }
  }
  return errors;
}
