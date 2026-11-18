/**
 * Comunidades Autónomas (and the two autonomous cities) by their ISO 3166-2:ES code, and how to
 * get one from a pool's address. The postcode is the most reliable source: its first two digits
 * are the INE province code (01–52), and every province belongs to exactly one community.
 */

export const CCAA = {
  AN: 'Andalucía',
  AR: 'Aragón',
  AS: 'Principado de Asturias',
  IB: 'Illes Balears',
  CN: 'Canarias',
  CB: 'Cantabria',
  CL: 'Castilla y León',
  CM: 'Castilla-La Mancha',
  CT: 'Cataluña',
  VC: 'Comunitat Valenciana',
  EX: 'Extremadura',
  GA: 'Galicia',
  MD: 'Comunidad de Madrid',
  MC: 'Región de Murcia',
  NC: 'Comunidad Foral de Navarra',
  PV: 'País Vasco',
  RI: 'La Rioja',
  CE: 'Ceuta',
  ML: 'Melilla',
} as const;

export type CcaaCode = keyof typeof CCAA;

export const CCAA_CODES = Object.keys(CCAA) as CcaaCode[];

export function isCcaaCode(value: unknown): value is CcaaCode {
  return typeof value === 'string' && Object.hasOwn(CCAA, value);
}

/** INE province code → community, with the province's names (Spanish first, then co-official). */
export const PROVINCES: Readonly<Record<string, { ccaa: CcaaCode; names: readonly string[] }>> = {
  '01': { ccaa: 'PV', names: ['Álava', 'Araba', 'Araba/Álava'] },
  '02': { ccaa: 'CM', names: ['Albacete'] },
  '03': { ccaa: 'VC', names: ['Alicante', 'Alacant'] },
  '04': { ccaa: 'AN', names: ['Almería'] },
  '05': { ccaa: 'CL', names: ['Ávila'] },
  '06': { ccaa: 'EX', names: ['Badajoz'] },
  '07': { ccaa: 'IB', names: ['Illes Balears', 'Islas Baleares', 'Baleares', 'Balears'] },
  '08': { ccaa: 'CT', names: ['Barcelona'] },
  '09': { ccaa: 'CL', names: ['Burgos'] },
  '10': { ccaa: 'EX', names: ['Cáceres'] },
  '11': { ccaa: 'AN', names: ['Cádiz'] },
  '12': { ccaa: 'VC', names: ['Castellón', 'Castelló', 'Castellón de la Plana'] },
  '13': { ccaa: 'CM', names: ['Ciudad Real'] },
  '14': { ccaa: 'AN', names: ['Córdoba'] },
  '15': { ccaa: 'GA', names: ['A Coruña', 'La Coruña', 'Coruña'] },
  '16': { ccaa: 'CM', names: ['Cuenca'] },
  '17': { ccaa: 'CT', names: ['Girona', 'Gerona'] },
  '18': { ccaa: 'AN', names: ['Granada'] },
  '19': { ccaa: 'CM', names: ['Guadalajara'] },
  '20': { ccaa: 'PV', names: ['Gipuzkoa', 'Guipúzcoa'] },
  '21': { ccaa: 'AN', names: ['Huelva'] },
  '22': { ccaa: 'AR', names: ['Huesca'] },
  '23': { ccaa: 'AN', names: ['Jaén'] },
  '24': { ccaa: 'CL', names: ['León'] },
  '25': { ccaa: 'CT', names: ['Lleida', 'Lérida'] },
  '26': { ccaa: 'RI', names: ['La Rioja', 'Rioja'] },
  '27': { ccaa: 'GA', names: ['Lugo'] },
  '28': { ccaa: 'MD', names: ['Madrid'] },
  '29': { ccaa: 'AN', names: ['Málaga'] },
  '30': { ccaa: 'MC', names: ['Murcia'] },
  '31': { ccaa: 'NC', names: ['Navarra', 'Nafarroa'] },
  '32': { ccaa: 'GA', names: ['Ourense', 'Orense'] },
  '33': { ccaa: 'AS', names: ['Asturias'] },
  '34': { ccaa: 'CL', names: ['Palencia'] },
  '35': { ccaa: 'CN', names: ['Las Palmas', 'Palmas'] },
  '36': { ccaa: 'GA', names: ['Pontevedra'] },
  '37': { ccaa: 'CL', names: ['Salamanca'] },
  '38': { ccaa: 'CN', names: ['Santa Cruz de Tenerife', 'Tenerife'] },
  '39': { ccaa: 'CB', names: ['Cantabria'] },
  '40': { ccaa: 'CL', names: ['Segovia'] },
  '41': { ccaa: 'AN', names: ['Sevilla'] },
  '42': { ccaa: 'CL', names: ['Soria'] },
  '43': { ccaa: 'CT', names: ['Tarragona'] },
  '44': { ccaa: 'AR', names: ['Teruel'] },
  '45': { ccaa: 'CM', names: ['Toledo'] },
  '46': { ccaa: 'VC', names: ['Valencia', 'València'] },
  '47': { ccaa: 'CL', names: ['Valladolid'] },
  '48': { ccaa: 'PV', names: ['Bizkaia', 'Vizcaya'] },
  '49': { ccaa: 'CL', names: ['Zamora'] },
  '50': { ccaa: 'AR', names: ['Zaragoza'] },
  '51': { ccaa: 'CE', names: ['Ceuta'] },
  '52': { ccaa: 'ML', names: ['Melilla'] },
};

/** Lowercase, no accents, no punctuation, single spaces: "Comunitat Valenciana" → "comunitat valenciana". */
export function foldPlace(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A five-digit Spanish postcode → its community; anything else → null. */
export function ccaaFromPostcode(cp: string | null | undefined): CcaaCode | null {
  const m = /^\s*(\d{2})\d{3}\s*$/.exec(cp ?? '');
  return (m && PROVINCES[m[1]!]?.ccaa) || null;
}

const BY_PROVINCE_NAME = new Map<string, CcaaCode>(
  Object.values(PROVINCES).flatMap((p) => p.names.map((n) => [foldPlace(n), p.ccaa] as const)),
);

/** A province name, in Spanish or a co-official language, case and accents ignored. */
export function ccaaFromProvinceName(name: string | null | undefined): CcaaCode | null {
  if (!name) return null;
  const folded = foldPlace(name).replace(/^provincia de /, '');
  return BY_PROVINCE_NAME.get(folded) ?? null;
}

/** Other ways people write a community, already folded (see `foldPlace`). */
export const CCAA_ALIASES: Readonly<Record<string, CcaaCode>> = {
  asturias: 'AS',
  baleares: 'IB',
  'islas baleares': 'IB',
  balears: 'IB',
  'islas canarias': 'CN',
  'castilla leon': 'CL',
  'castilla la mancha': 'CM',
  catalunya: 'CT',
  cataluna: 'CT',
  catalonia: 'CT',
  'comunidad valenciana': 'VC',
  valenciana: 'VC',
  madrid: 'MD',
  murcia: 'MC',
  navarra: 'NC',
  euskadi: 'PV',
  'pais vasco': 'PV',
  rioja: 'RI',
};

const BY_CCAA_NAME = new Map<string, CcaaCode>([
  ...CCAA_CODES.map((c) => [foldPlace(CCAA[c]), c] as const),
  ...(Object.entries(CCAA_ALIASES) as [string, CcaaCode][]),
]);

/**
 * What someone typed in the old free-text "Comunidad autónoma" field: a community name, an ISO
 * code ("CT"), or a province name ("Barcelona").
 */
export function ccaaFromText(text: string | null | undefined): CcaaCode | null {
  if (!text) return null;
  const upper = text.trim().toUpperCase();
  if (isCcaaCode(upper)) return upper;
  if (upper === 'CAT') return 'CT';
  const folded = foldPlace(text).replace(/^(comunidad autonoma de|comunidad de|region de) /, '');
  return BY_CCAA_NAME.get(folded) ?? ccaaFromProvinceName(text);
}

/**
 * A pool's community from its address: postcode first, then province, then the old free text.
 * Null when none of them says.
 */
export function resolveCcaa(pool: {
  cp?: string | null;
  provincia?: string | null;
  ccaa?: string | null;
}): CcaaCode | null {
  return (
    ccaaFromPostcode(pool.cp) ?? ccaaFromProvinceName(pool.provincia) ?? ccaaFromText(pool.ccaa)
  );
}
