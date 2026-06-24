/**
 * SILOE annual-results catalog codes.
 * Source: Anexo_CargaXML_Result_Anual v1.4 (2022-04-08). See docs/technical-spec.md Appendix A.
 *
 * These numeric IDs are the values SILOE expects in the annual-results XML. They are the
 * canonical reference; the DB `siloe_catalog` table is seeded from this file.
 */

/** Punto de muestreo (id_pm). */
export const TIPO_PM = {
  1: 'En el circuito',
  2: 'En el vaso',
  3: 'Ambos',
  4: 'Cada vez uno de ellos',
} as const;

/** Tipo de análisis (id_tipo_analisis). */
export const TIPO_ANALISIS = {
  1: 'Autocontrol',
  2: 'Vigilancia sanitaria',
} as const;

/** Lugar de análisis (idLugar). */
export const LUGAR = {
  1: 'In situ',
  2: 'Laboratorio',
} as const;

/** Motivo de cierre (per_id_motivo). */
export const MOTIVO_CIERRE = {
  1: 'Cierre por vacaciones',
  2: 'Cierre Autoridad Sanitaria',
  3: 'Cierre por obras',
  4: 'Cierre por avería',
  5: 'Cierre por accidente',
  6: 'Otros',
  7: 'COVID-19',
} as const;

/** Método de análisis (idMetodo). */
export const METODO = {
  1: 'Potenciometría',
  2: 'Kit',
  3: 'Contadores',
  4: 'Visual',
  5: 'Nefelométrico',
  6: 'Espectrofotometría UV/VIS',
  7: 'Volumetría',
  8: 'Número más probable',
  9: 'Cultivo',
  10: 'Fotometría',
  11: 'Sustrato definido',
  12: 'Filtración membrana',
  13: 'PCR',
  14: 'Otros',
  15: 'Cromatografía',
} as const;

export type ParameterMedium = 'water' | 'air';
export type ParameterTier = 'mandatory' | 'optional';

export interface SiloeParameter {
  /** id_parametro */
  id: number;
  name: string;
  unit: string | null;
  medium: ParameterMedium;
  tier: ParameterTier;
  /** Valid idLugar values for this parameter. */
  allowedLugar: Array<keyof typeof LUGAR>;
  /** Valid idMetodo values for this parameter (empty = "Otros"/unspecified). */
  allowedMetodo: Array<keyof typeof METODO>;
}

/**
 * PARAMETROS table (id_parametro) with their valid LUGAR/METODO combinations.
 * SILOE rejects invalid combos with errors 239–241.
 */
export const PARAMETROS: readonly SiloeParameter[] = [
  // --- Agua, obligatorios ---
  {
    id: 1,
    name: 'pH',
    unit: 'pH',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [1, 2, 10],
  },
  {
    id: 2,
    name: 'Potencial REDOX',
    unit: 'mV',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [1],
  },
  {
    id: 3,
    name: 'Temperatura del agua',
    unit: '°C',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [3],
  },
  {
    id: 4,
    name: 'Tiempo de recirculación',
    unit: 'horas',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [3],
  },
  {
    id: 5,
    name: 'Transparencia',
    unit: null,
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [4],
  },
  {
    id: 6,
    name: 'Turbidez',
    unit: 'UNF',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [5],
  },
  {
    id: 7,
    name: 'Ácido isocianúrico',
    unit: 'mg/L',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [2, 6, 7],
  },
  {
    id: 8,
    name: 'Bromo total',
    unit: 'mg/L',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [2, 6, 7],
  },
  {
    id: 9,
    name: 'Cloro combinado residual',
    unit: 'mg/L',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [2, 6, 7],
  },
  {
    id: 10,
    name: 'Cloro libre residual',
    unit: 'mg/L',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [1, 2],
    allowedMetodo: [2, 6, 7],
  },
  {
    id: 11,
    name: 'E. coli',
    unit: 'UFC/100ml',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [2],
    allowedMetodo: [8, 11, 12],
  },
  {
    id: 12,
    name: 'Legionella sp',
    unit: 'UFC/L',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [2],
    allowedMetodo: [9, 13],
  },
  {
    id: 13,
    name: 'P. aeruginosa',
    unit: 'UFC/100ml',
    medium: 'water',
    tier: 'mandatory',
    allowedLugar: [2],
    allowedMetodo: [9],
  },
  // --- Aire, obligatorios ---
  {
    id: 14,
    name: 'CO2',
    unit: 'mg/m3',
    medium: 'air',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [3],
  },
  {
    id: 15,
    name: 'Humedad relativa aire',
    unit: '%',
    medium: 'air',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [3],
  },
  {
    id: 16,
    name: 'Temperatura ambiente',
    unit: '°C',
    medium: 'air',
    tier: 'mandatory',
    allowedLugar: [1],
    allowedMetodo: [3],
  },
  // --- Agua, opcionales ---
  {
    id: 105,
    name: 'Aluminio',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 106,
    name: 'Cobre',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 107,
    name: 'Hierro',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 108,
    name: 'Nitratos',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 109,
    name: 'Nitritos',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 110,
    name: 'Plata',
    unit: 'µg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 111,
    name: 'Plomo',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 112,
    name: 'Amoniaco',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 113,
    name: 'Conductividad',
    unit: 'µS/cm',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 115,
    name: 'Sustancias tensioactivas',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 116,
    name: 'Presencia de espumas, grasas etc',
    unit: null,
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 117,
    name: 'Índice de saturación de Langelier',
    unit: null,
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 118,
    name: 'Olor',
    unit: null,
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 119,
    name: 'Color',
    unit: null,
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 120,
    name: 'Biguanidas',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 121,
    name: 'Hidantoina',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 122,
    name: 'Ozono',
    unit: 'mg/l',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 123,
    name: 'Bacterias aerobias a 22° C',
    unit: 'UFC/ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 124,
    name: 'Bacterias aerobias a 37° C',
    unit: 'UFC/ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 125,
    name: 'Bacterias coliformes',
    unit: 'UFC/100 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 126,
    name: 'Enterococos intestinales',
    unit: 'UFC/100 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 127,
    name: 'Protozoos',
    unit: 'individuos/1000 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [1, 2],
    allowedMetodo: [14],
  },
  {
    id: 128,
    name: 'Salmonella sp.',
    unit: 'UFC/1000 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 129,
    name: 'Staphylococcus aureus',
    unit: 'UFC/100 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  {
    id: 130,
    name: 'Streptococos fecales',
    unit: 'UFC/100 ml',
    medium: 'water',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [14],
  },
  // --- Aire, opcionales ---
  {
    id: 131,
    name: 'Trihalometanos',
    unit: 'µg/l',
    medium: 'air',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [15],
  },
  {
    id: 132,
    name: 'Cloraminas',
    unit: 'µg/l',
    medium: 'air',
    tier: 'optional',
    allowedLugar: [2],
    allowedMetodo: [15],
  },
] as const;

export const PARAMETROS_BY_ID: ReadonlyMap<number, SiloeParameter> = new Map(
  PARAMETROS.map((p) => [p.id, p]),
);
