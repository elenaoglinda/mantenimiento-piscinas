/**
 * The demo org's data, as plain rows per table. Pure and deterministic: same `today`, same
 * people, same parameter definitions → byte-for-byte the same rows (fixed ids, a seeded random
 * generator). The seed script inserts them; the tests check counts and invariants. See
 * scripts/demo/README.md.
 */
import { createHash } from 'node:crypto';
import { evaluate, type ParameterDef } from '../../packages/shared/src/evaluate.js';
import { madridStartOfDay } from '../../packages/shared/src/history/index.js';

export const DEMO_ORG_NAME = 'Piscinas Mediterráneo (demo)';
/** The org name while the seed is half-way: still a demo name, but never the final one. */
export const DEMO_ORG_NAME_INCOMPLETE = 'Piscinas Mediterráneo (creando…) (demo)';
export const DEMO_DAYS = 90;

/** The one rule that protects real customers: the seed only ever touches these orgs. */
export function isDemoOrgName(name: unknown): boolean {
  return typeof name === 'string' && /\(demo\)\s*$/.test(name);
}

export type Row = Record<string, unknown>;
export type DemoData = Record<DemoTable, Row[]>;

/** Insertion order (parents first). Deletion is the reverse. */
export const DEMO_TABLES = [
  'org',
  'app_user',
  'client',
  'pool',
  'basin',
  'chemical_product',
  'task_def',
  'report',
  'measurement',
  'incident',
  'attachment',
  'report_chemical',
  'report_task',
  'route',
  'route_stop',
  'invoice_series',
  'invoice',
  'invoice_line',
] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

/** A stable UUID for a key: the same demo object gets the same id on every run. */
export function demoId(key: string): string {
  const h = createHash('sha1').update(`cloro-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const DEMO_ORG_ID = demoId('org');

/** mulberry32: tiny, fast, good enough for believable noise; seeded per stream. */
function rng(seed: string) {
  let a = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface DemoParamDef extends ParameterDef {
  /** parameter_def.id in the target database (national row). */
  id: string;
  /** paramKey: SILOÉ id, or 101–104 for readings outside SILOÉ. */
  key: number;
}

export interface DemoPerson {
  id: string;
  email: string;
  fullName: string;
}

export interface DemoInput {
  /** Madrid calendar day the data ends on, 'YYYY-MM-DD'. */
  today: string;
  admin: DemoPerson;
  technicians: [DemoPerson, DemoPerson];
  /** National parameter definitions by key; keys without a definition are not measured. */
  params: readonly DemoParamDef[];
}

/** Objects in storage the rows point at (photos, signatures, logo). Bytes made by the script. */
export interface DemoFile {
  path: string;
  kind: 'photo' | 'signature' | 'logo';
  /** Seed for the picture, so it is the same every run. */
  seed: string;
}

// ---------------------------------------------------------------------------
// The portfolio
// ---------------------------------------------------------------------------

type Who = 0 | 1; // technician index

interface VasoSpec {
  key: string;
  name: string;
  indoor: boolean;
  salt: boolean;
  siloe: boolean;
  capacidad: number;
}
interface PoolSpec {
  key: string;
  client: string;
  name: string;
  poolType: 'tipo_2' | 'tipo_3a' | null;
  direccion: string;
  cp: string;
  municipio: string;
  lat: number;
  lng: number;
  /** Weekdays visited (1 = Monday). */
  days: number[];
  tech: Who;
  vasos: VasoSpec[];
}

const CLIENTS = [
  {
    key: 'mar-azul',
    name: 'Comunidad de Propietarios Residencial Mar Azul',
    cif: 'H03123456',
    email: 'administracion@marazul.example.com',
    notes: 'Presidenta: Marta Soler. Llaves en conserjería (de 8:00 a 14:00).',
    signer: 'Marta Soler',
  },
  {
    key: 'costa-blanca',
    name: 'Hotel Costa Blanca Playa',
    cif: 'B03987654',
    email: 'mantenimiento@hotelcostablanca.example.com',
    notes: 'Contacto: Andrés Pastor, jefe de mantenimiento. Acceso por el muelle de carga.',
    signer: 'Andrés Pastor',
  },
  {
    key: 'almendros',
    name: 'Villa Los Almendros (particular)',
    cif: '12345678Z',
    email: 'familia.navarro@almendros.example.com',
    notes: 'Clorador salino. Avisar por teléfono antes de ir; perro en la parcela.',
    signer: 'Elena Navarro',
  },
] as const;

const vaso = (key: string, name: string, o: Partial<VasoSpec> = {}): VasoSpec => ({
  key,
  name,
  indoor: false,
  salt: false,
  siloe: true,
  capacidad: 180,
  ...o,
});

export const POOLS: readonly PoolSpec[] = [
  {
    key: 'mar-azul-1',
    client: 'mar-azul',
    name: 'Residencial Mar Azul · Fase I',
    poolType: 'tipo_3a',
    direccion: 'Avenida de Niza, 21',
    cp: '03540',
    municipio: 'Alicante',
    lat: 38.3712,
    lng: -0.4123,
    days: [2, 5],
    tech: 0,
    vasos: [
      vaso('ma1-adultos', 'Piscina de adultos', { capacidad: 320 }),
      vaso('ma1-infantil', 'Piscina infantil', { capacidad: 25 }),
    ],
  },
  {
    key: 'mar-azul-2',
    client: 'mar-azul',
    name: 'Residencial Mar Azul · Fase II',
    poolType: 'tipo_3a',
    direccion: 'Avenida de Niza, 35',
    cp: '03540',
    municipio: 'Alicante',
    lat: 38.3729,
    lng: -0.4101,
    days: [2, 5],
    tech: 0,
    vasos: [vaso('ma2-piscina', 'Piscina comunitaria', { capacidad: 240 })],
  },
  {
    key: 'mar-azul-3',
    client: 'mar-azul',
    name: 'Residencial Mar Azul · Club social',
    poolType: 'tipo_3a',
    direccion: 'Calle Pintor Pérez Gil, 4',
    cp: '03540',
    municipio: 'Alicante',
    lat: 38.3698,
    lng: -0.4167,
    days: [2, 5],
    tech: 0,
    vasos: [vaso('ma3-piscina', 'Piscina del club', { capacidad: 150 })],
  },
  {
    key: 'cb-exterior',
    client: 'costa-blanca',
    name: 'Hotel Costa Blanca · Piscina exterior',
    poolType: 'tipo_2',
    direccion: 'Avenida del Mediterráneo, 112',
    cp: '03503',
    municipio: 'Benidorm',
    lat: 38.5361,
    lng: -0.1185,
    days: [1, 3, 5],
    tech: 1,
    vasos: [
      vaso('cbe-adultos', 'Piscina principal', { capacidad: 480 }),
      vaso('cbe-chapoteo', 'Chapoteo infantil', { capacidad: 18 }),
    ],
  },
  {
    key: 'cb-spa',
    client: 'costa-blanca',
    name: 'Hotel Costa Blanca · Spa',
    poolType: 'tipo_2',
    direccion: 'Avenida del Mediterráneo, 112 (planta -1)',
    cp: '03503',
    municipio: 'Benidorm',
    lat: 38.5362,
    lng: -0.1183,
    days: [1, 3, 5],
    tech: 1,
    vasos: [
      vaso('cbs-climatizada', 'Piscina climatizada', { indoor: true, capacidad: 140 }),
      vaso('cbs-hidromasaje', 'Vaso de hidromasaje', { indoor: true, capacidad: 8 }),
    ],
  },
  {
    key: 'cb-solarium',
    client: 'costa-blanca',
    name: 'Hotel Costa Blanca · Solárium',
    poolType: 'tipo_2',
    direccion: 'Avenida del Mediterráneo, 112 (azotea)',
    cp: '03503',
    municipio: 'Benidorm',
    lat: 38.5364,
    lng: -0.1188,
    days: [1, 3, 5],
    tech: 1,
    vasos: [vaso('cbsol-piscina', 'Piscina del solárium', { capacidad: 90 })],
  },
  {
    key: 'cb-club',
    client: 'costa-blanca',
    name: 'Hotel Costa Blanca · Club infantil',
    poolType: 'tipo_2',
    direccion: 'Calle Gerona, 9',
    cp: '03503',
    municipio: 'Benidorm',
    lat: 38.5379,
    lng: -0.1221,
    days: [1, 3, 5],
    tech: 1,
    vasos: [vaso('cbc-piscina', 'Piscina del club infantil', { capacidad: 60 })],
  },
  {
    key: 'almendros',
    client: 'almendros',
    name: 'Villa Los Almendros',
    poolType: null,
    direccion: 'Partida de la Condomina, 7',
    cp: '03560',
    municipio: 'El Campello',
    lat: 38.4302,
    lng: -0.4011,
    days: [1, 4],
    tech: 0,
    vasos: [vaso('alm-piscina', 'Piscina', { salt: true, siloe: false, capacidad: 60 })],
  },
];

const OFFICE = { lat: 38.3452, lng: -0.481 }; // Alicante

const PRODUCTS: [string, string, number | null][] = [
  ['Cloro granulado', 'kg', 0.5],
  ['Cloro en pastillas', 'pastillas', 2],
  ['Minorador de pH', 'kg', 0.5],
  ['Incrementador de pH', 'kg', 0.5],
  ['Floculante', 'L', 0.5],
  ['Alguicida', 'L', 0.5],
  ['Clarificante', 'L', 0.25],
  ['Sal', 'kg', 25],
];
const TASKS = [
  'Barrido / limpieza de fondo',
  'Limpieza de paredes y línea de flotación',
  'Vaciado de skimmers y prefiltro',
  'Contralavado del filtro',
  'Limpieza del filtro',
  'Revisión de bomba y equipos',
  'Revisión del clorador salino',
  'Retirada de hojas',
];

/**
 * The red readings of the 90 days: six, each with an incident and its corrective action. The
 * last is two days ago, so the dashboard opens with an alert to follow.
 */
const ANOMALIES: {
  vaso: string;
  daysAgo: number;
  key: number;
  value: number;
  description: string;
  action: string;
}[] = [
  {
    vaso: 'cbe-adultos',
    daysAgo: 71,
    key: 10,
    value: 0.2,
    description:
      'Cloro libre por debajo del mínimo legal tras un fin de semana de ocupación completa.',
    action: 'Cloración de choque y cierre del vaso durante 2 horas; nueva medición: 1,2 mg/L.',
  },
  {
    vaso: 'ma1-infantil',
    daysAgo: 55,
    key: 1,
    value: 8.4,
    description: 'pH por encima del máximo legal en la piscina infantil.',
    action: 'Minorador de pH y revisión de la bomba dosificadora, que estaba obstruida.',
  },
  {
    vaso: 'cbs-hidromasaje',
    daysAgo: 38,
    key: 9,
    value: 0.9,
    description: 'Cloro combinado alto (cloraminas): olor fuerte en el spa.',
    action: 'Renovación del 30 % del agua y supercloración; se avisa a recepción.',
  },
  {
    vaso: 'cbsol-piscina',
    daysAgo: 24,
    key: 6,
    value: 6.5,
    description: 'Agua turbia: turbidez por encima del límite legal.',
    action: 'Contralavado del filtro y floculante; se repite la medición en la siguiente visita.',
  },
  {
    vaso: 'ma2-piscina',
    daysAgo: 13,
    key: 1,
    value: 8.3,
    description: 'pH por encima del máximo legal tras la tormenta del fin de semana.',
    action: 'Minorador de pH y retirada de hojas y barro del fondo; nueva medición: 7,6.',
  },
  {
    vaso: 'cbe-chapoteo',
    daysAgo: 2,
    key: 10,
    value: 0.3,
    description:
      'Cloro libre por debajo del mínimo legal en el chapoteo tras un fin de semana de mucho uso.',
    action:
      'Cloración de choque; nueva medición a la hora: 1,0 mg/L. Se vuelve a medir en la próxima visita.',
  },
];

// Normal ranges each reading drifts in: comfortably inside the legal or recommended band.
const BANDS: Record<number, { lo: number; hi: number; mean: number; step: number; dp: number }> = {
  1: { lo: 7.25, hi: 7.7, mean: 7.45, step: 0.06, dp: 2 },
  3: { lo: 26.5, hi: 29.2, mean: 27.8, step: 0.3, dp: 1 },
  6: { lo: 0.2, hi: 1.4, mean: 0.6, step: 0.15, dp: 2 },
  7: { lo: 20, hi: 60, mean: 35, step: 2.5, dp: 0 },
  9: { lo: 0.05, hi: 0.4, mean: 0.18, step: 0.05, dp: 2 },
  10: { lo: 0.75, hi: 1.7, mean: 1.15, step: 0.12, dp: 2 },
  101: { lo: 85, hi: 115, mean: 100, step: 4, dp: 0 },
  102: { lo: 220, hi: 380, mean: 290, step: 12, dp: 0 },
  103: { lo: 3.4, hi: 4.7, mean: 4.1, step: 0.1, dp: 1 },
  104: { lo: 0.01, hi: 0.08, mean: 0.04, step: 0.01, dp: 2 },
};

// ---------------------------------------------------------------------------
// Calendar helpers (Madrid days)
// ---------------------------------------------------------------------------

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(ymd: string): number {
  const w = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}
function isWorkingDay(ymd: string): boolean {
  return weekday(ymd) <= 5;
}
/** Madrid wall-clock time on `ymd` → ISO instant. */
function at(ymd: string, hour: number, minute: number): string {
  return new Date(Date.parse(madridStartOfDay(ymd)) + (hour * 60 + minute) * 60_000).toISOString();
}

/** The `n` working days before `today` (oldest first) and `today` plus the `n` after it. */
export function routeDays(today: string, n = 5): { past: string[]; upcoming: string[] } {
  const past: string[] = [];
  for (let d = addDays(today, -1); past.length < n; d = addDays(d, -1))
    if (isWorkingDay(d)) past.unshift(d);
  const upcoming: string[] = isWorkingDay(today) ? [today] : [];
  for (
    let d = addDays(today, 1);
    upcoming.length < n + (isWorkingDay(today) ? 1 : 0);
    d = addDays(d, 1)
  ) {
    if (isWorkingDay(d)) upcoming.push(d);
  }
  return { past, upcoming };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateDemo(input: DemoInput): { data: DemoData; files: DemoFile[] } {
  const { today } = input;
  const org = DEMO_ORG_ID;
  const data = Object.fromEntries(DEMO_TABLES.map((t) => [t, [] as Row[]])) as DemoData;
  const files: DemoFile[] = [];
  const defs = new Map(input.params.map((p) => [p.key, p]));
  const techs = input.technicians;
  const firstDay = addDays(today, -(DEMO_DAYS - 1));
  const startedAt = at(firstDay, 8, 0);

  data.org.push({
    id: org,
    type: 'company',
    name: DEMO_ORG_NAME_INCOMPLETE,
    created_at: at(addDays(firstDay, -30), 9, 0),
  });
  data.app_user.push(
    {
      id: input.admin.id,
      org_id: org,
      role: 'admin',
      full_name: input.admin.fullName,
      email: input.admin.email,
    },
    ...techs.map((t) => ({
      id: t.id,
      org_id: org,
      role: 'technician',
      full_name: t.fullName,
      email: t.email,
    })),
  );

  for (const c of CLIENTS) {
    data.client.push({
      id: demoId(`client:${c.key}`),
      org_id: org,
      name: c.name,
      cif_nif: c.cif,
      contact_email: c.email,
      // No phone on purpose: a demo must never open WhatsApp to a real stranger's number.
      contact_phone: null,
      notes: c.notes,
      billing_direccion: null,
      created_at: startedAt,
    });
  }

  POOLS.forEach((p, i) => {
    data.pool.push({
      id: demoId(`pool:${p.key}`),
      org_id: org,
      client_id: demoId(`client:${p.client}`),
      denominacion: p.name,
      pool_type: p.poolType,
      agua_alimentacion: ['red_publica'],
      ccaa: 'Comunitat Valenciana',
      provincia: 'Alicante',
      municipio: p.municipio,
      localidad: p.municipio,
      cp: p.cp,
      direccion: p.direccion,
      lat: p.lat,
      lng: p.lng,
      siloe_cod_p: p.poolType ? `03${String(140 + i).padStart(4, '0')}` : null,
      siloe_cod_ccaa: p.poolType ? '10' : null,
      created_at: startedAt,
    });
    p.vasos.forEach((v, j) => {
      data.basin.push({
        id: demoId(`basin:${v.key}`),
        org_id: org,
        pool_id: demoId(`pool:${p.key}`),
        num_orden: j + 1,
        denominacion: v.name,
        clase: v.indoor ? 'cubierto' : 'descubierto',
        tipo_vaso: [
          v.name.includes('infantil') || v.name.includes('Chapoteo')
            ? 'infantil'
            : v.name.includes('hidromasaje')
              ? 'hidromasaje'
              : 'polivalente',
        ],
        capacidad_m3: v.capacidad,
        siloe_cod_v: p.poolType ? `V${String(i + 1).padStart(2, '0')}${j + 1}` : null,
        siloe_cod_v_p: p.poolType ? `${String(140 + i).padStart(4, '0')}-${j + 1}` : null,
        created_at: startedAt,
      });
    });
  });

  PRODUCTS.forEach(([nombre, unidad, habitual], i) =>
    data.chemical_product.push({
      id: demoId(`product:${nombre}`),
      org_id: org,
      nombre,
      unidad,
      cantidad_habitual: habitual,
      activo: true,
      orden: i + 1,
    }),
  );
  TASKS.forEach((nombre, i) =>
    data.task_def.push({
      id: demoId(`task:${nombre}`),
      org_id: org,
      nombre,
      orden: i + 1,
      activo: true,
    }),
  );
  const product = (n: string) => demoId(`product:${n}`);
  const task = (n: string) => demoId(`task:${n}`);

  // Routes first: they decide which past visits were skipped.
  const { past, upcoming } = routeDays(today);
  const skipped = new Map<string, string>(); // `${poolKey}|${day}` → motivo
  const pastRoutes = past.map((d) => ({
    d,
    stops: [0, 1].map((w) => POOLS.filter((p) => p.tech === w && p.days.includes(weekday(d)))),
  }));
  // Two skipped stops: the villa two working days ago (or the nearest day it was on the route),
  // and the hotel's club infantil four working days ago.
  const skipOn = (poolKey: string, from: number, motivo: string) => {
    for (let i = past.length - from; i >= 0; i--) {
      const d = past[i]!;
      const p = POOLS.find((x) => x.key === poolKey)!;
      if (p.days.includes(weekday(d))) {
        skipped.set(`${poolKey}|${d}`, motivo);
        return;
      }
    }
  };
  skipOn('almendros', 2, 'Cliente ausente: no había acceso a la parcela.');
  skipOn('cb-club', 4, 'Club cerrado por obras; se reprograma.');

  // Visits.
  const state = new Map<string, number>(); // `${vaso}|${key}` → last value
  const reportByPoolDay = new Map<string, string>();
  const signer = (clientKey: string) => CLIENTS.find((c) => c.key === clientKey)!.signer;
  const anomalyDone = new Set<number>();

  for (let offset = DEMO_DAYS - 1; offset >= 0; offset--) {
    const day = addDays(today, -offset);
    const wd = weekday(day);
    // Today only the first stop of each route has been visited (it's "this morning").
    const todayFirst =
      offset === 0
        ? new Set(
            upcoming[0] === today
              ? [0, 1].map((w) => POOLS.find((p) => p.tech === w && p.days.includes(wd))?.key)
              : [],
          )
        : null;
    const perTech = [0, 0];
    for (const p of POOLS) {
      if (!p.days.includes(wd)) continue;
      if (skipped.has(`${p.key}|${day}`)) continue;
      if (todayFirst && !todayFirst.has(p.key)) continue;
      const order = perTech[p.tech]++;
      const hour = 9 + Math.floor(order * 1.2);
      const minute = (order * 47 + p.key.length * 7) % 60;
      const visitedAt = at(day, hour, minute);
      const signed = offset < 7;
      p.vasos.forEach((v, vi) => {
        const rid = demoId(`report:${v.key}:${day}`);
        if (vi === 0) reportByPoolDay.set(`${p.key}|${day}`, rid);
        const r = rng(`visit:${v.key}:${day}`);
        const at2 = new Date(Date.parse(visitedAt) + vi * 12 * 60_000).toISOString();
        const firstOfWeek = !p.days.some((x) => x < wd);
        const measuredKeys = [1, 10, 9];
        if (v.indoor) measuredKeys.push(3);
        if (firstOfWeek) measuredKeys.push(6, 101);
        if (firstOfWeek && !v.indoor && !v.salt) measuredKeys.push(7);
        if (v.salt) measuredKeys.push(103);
        if (day.endsWith('-01') || (firstOfWeek && Number(day.slice(8)) <= 7))
          measuredKeys.push(102, 104);

        const anomaly = ANOMALIES.findIndex(
          (a, ai) => !anomalyDone.has(ai) && a.vaso === v.key && offset <= a.daysAgo,
        );
        const redKey = anomaly >= 0 ? ANOMALIES[anomaly]!.key : null;
        if (anomaly >= 0 && !measuredKeys.includes(redKey!)) measuredKeys.push(redKey!);

        let anyRed = false;
        for (const key of measuredKeys) {
          const def = defs.get(key);
          if (!def) continue;
          const b = BANDS[key]!;
          const prev = state.get(`${v.key}|${key}`) ?? b.mean + (r() - 0.5) * (b.hi - b.lo) * 0.4;
          // Mean-reverting walk, clamped inside the comfortable band.
          let value = prev + (b.mean - prev) * 0.25 + (r() - 0.5) * 2 * b.step;
          value = Math.min(b.hi, Math.max(b.lo, value));
          state.set(`${v.key}|${key}`, value);
          if (key === redKey) value = ANOMALIES[anomaly]!.value;
          value = Number(value.toFixed(b.dp));
          const ev = evaluate(value, def);
          if (ev.status === 'red') anyRed = true;
          data.measurement.push({
            id: demoId(`m:${rid}:${key}`),
            org_id: org,
            report_id: rid,
            parameter_def_id: def.id,
            value,
            lugar: 'in_situ',
            compliant: ev.compliant,
            status: ev.status,
            created_at: at2,
          });
        }
        if (anomaly >= 0) {
          anomalyDone.add(anomaly);
          const a = ANOMALIES[anomaly]!;
          data.incident.push({
            id: demoId(`inc:${rid}`),
            org_id: org,
            report_id: rid,
            description: a.description,
            corrective_action: a.action,
            created_at: at2,
          });
        }

        // Products: chlorine every visit, the rest now and then.
        const chems: [string, number][] = [];
        if (v.salt) {
          if (r() < 0.15) chems.push(['Sal', 25]);
        } else if (v.indoor) chems.push(['Cloro granulado', v.capacidad > 50 ? 0.75 : 0.25]);
        else chems.push(['Cloro en pastillas', v.capacidad > 200 ? 4 : v.capacidad > 50 ? 2 : 1]);
        if (r() < 0.35 || (redKey === 1 && ANOMALIES[anomaly]!.value > 8))
          chems.push(['Minorador de pH', 0.5]);
        if (redKey === 1 && ANOMALIES[anomaly]!.value < 7.2)
          chems.push(['Incrementador de pH', 0.5]);
        if (redKey === 10 || redKey === 9) chems.push(['Cloro granulado', 1.5]);
        if (firstOfWeek && !v.indoor) chems.push(['Alguicida', 0.5]);
        if (redKey === 6 || r() < 0.08) chems.push(['Floculante', 0.5]);
        const seen = new Set<string>();
        for (const [name, cantidad] of chems) {
          if (seen.has(name)) continue;
          seen.add(name);
          const unidad = PRODUCTS.find(([n]) => n === name)![1];
          data.report_chemical.push({
            id: demoId(`rc:${rid}:${name}`),
            org_id: org,
            report_id: rid,
            product_id: product(name),
            cantidad,
            unidad,
            created_at: at2,
          });
        }

        // Tasks: the routine three, plus the filter on the first visit of the week.
        const done = [
          'Barrido / limpieza de fondo',
          'Vaciado de skimmers y prefiltro',
          'Limpieza de paredes y línea de flotación',
        ];
        if (firstOfWeek) done.push('Contralavado del filtro');
        if (!v.indoor && r() < 0.4) done.push('Retirada de hojas');
        if (v.salt) done.push('Revisión del clorador salino');
        if (r() < 0.2) done.push('Revisión de bomba y equipos');
        for (const name of done) {
          const nota =
            name === 'Contralavado del filtro' && r() < 0.15
              ? 'Presión del filtro alta antes del lavado (1,4 bar).'
              : null;
          data.report_task.push({
            id: demoId(`rt:${rid}:${name}`),
            org_id: org,
            report_id: rid,
            task_id: task(name),
            hecho: true,
            nota,
          });
        }

        // Photos: the incidents, and about one visit in eight.
        const photos = (anomaly >= 0 ? 1 : 0) + (r() < 0.12 ? 1 : 0);
        for (let k = 0; k < photos; k++) {
          const path = `${org}/${rid}/photo-${demoId(`photo:${rid}:${k}`)}-foto.png`;
          files.push({
            path,
            kind: 'photo',
            seed: `${v.key}:${day}:${k}:${anomaly >= 0 && k === 0 ? 'turbia' : 'clara'}`,
          });
          data.attachment.push({
            id: demoId(`att:${rid}:${k}`),
            org_id: org,
            report_id: rid,
            kind: 'photo',
            storage_path: path,
            created_at: at2,
          });
        }

        const signedAt = new Date(Date.parse(at2) + 25 * 60_000).toISOString();
        const signaturePath = signed ? `${org}/${rid}/signature.png` : null;
        if (signaturePath)
          files.push({ path: signaturePath, kind: 'signature', seed: `${p.client}:${rid}` });
        data.report.push({
          id: rid,
          org_id: org,
          pool_id: demoId(`pool:${p.key}`),
          basin_id: demoId(`basin:${v.key}`),
          technician_id: techs[p.tech].id,
          visited_at: at2,
          status: signed ? 'signed' : 'completed',
          analysis_type: 'autocontrol',
          punto_muestreo: 1,
          location_lat: p.lat,
          location_lng: p.lng,
          notes: anyRed ? null : r() < 0.1 ? 'Agua cristalina; sin incidencias.' : null,
          signed_at: signed ? signedAt : null,
          signed_by_name: signed ? signer(p.client) : null,
          signed_by_dni: signed ? '12345678Z' : null,
          signature_path: signaturePath,
          created_at: at2,
          updated_at: signed ? signedAt : at2,
        });
      });
    }
  }

  // Route rows: past days (done or skipped), today and the next days (pending).
  const routeFor = (d: string, w: Who) =>
    POOLS.filter((p) => p.tech === w && p.days.includes(weekday(d)));
  for (const d of [...past, ...upcoming]) {
    for (const w of [0, 1] as Who[]) {
      const stops = routeFor(d, w);
      if (!stops.length) continue;
      const routeId = demoId(`route:${w}:${d}`);
      let legTotal = 0;
      let prev = OFFICE;
      const stopRows = stops.map((p, seq) => {
        const km = Math.hypot((p.lat - prev.lat) * 111, (p.lng - prev.lng) * 87);
        const leg = Math.max(180, Math.round((km / 45) * 3600));
        legTotal += leg;
        prev = p;
        const motivo = skipped.get(`${p.key}|${d}`) ?? null;
        const reportId = reportByPoolDay.get(`${p.key}|${d}`) ?? null;
        const estado = motivo ? 'saltada' : reportId ? 'hecha' : 'pendiente';
        return {
          id: demoId(`stop:${w}:${d}:${p.key}`),
          org_id: org,
          route_id: routeId,
          pool_id: demoId(`pool:${p.key}`),
          seq: seq + 1,
          eta: at(d, 9 + Math.floor(seq * 1.2), (seq * 47) % 60),
          leg_s: leg,
          estado,
          motivo,
          report_id: estado === 'hecha' ? reportId : null,
          created_at: at(addDays(d, -1), 18, 0),
        };
      });
      void pastRoutes;
      data.route.push({
        id: routeId,
        org_id: org,
        technician_id: techs[w].id,
        route_date: d,
        start_lat: OFFICE.lat,
        start_lng: OFFICE.lng,
        distance_m: Math.round((legTotal / 3600) * 45_000 * 2),
        duration_s: legTotal * 2,
        created_at: at(addDays(d, -1), 18, 0),
      });
      data.route_stop.push(...stopRows);
    }
  }

  // Draft invoices only. The demo org has no billing profile, so they can't be issued: nothing
  // here can ever reach Verifacti or the AEAT.
  const series = demoId('series:demo');
  data.invoice_series.push({
    id: series,
    org_id: org,
    code: 'DEMO',
    description: 'Serie de la demo (solo borradores)',
    next_number: 1,
  });
  const monthName = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${addDays(today, -30).slice(0, 7)}-15T12:00:00Z`));
  const invoices: [string, string, [string, number, number][]][] = [
    [
      'mar-azul',
      `Mantenimiento de piscinas · ${monthName}`,
      [
        ['Mantenimiento Fase I (2 vasos)', 1, 32000],
        ['Mantenimiento Fase II', 1, 18000],
        ['Mantenimiento Club social', 1, 15000],
      ],
    ],
    [
      'costa-blanca',
      `Mantenimiento de piscinas y spa · ${monthName}`,
      [
        ['Mantenimiento piscina exterior y chapoteo', 1, 54000],
        ['Mantenimiento spa (2 vasos)', 1, 42000],
        ['Productos químicos', 1, 12850],
      ],
    ],
    [
      'almendros',
      `Mantenimiento de piscina · ${monthName}`,
      [
        ['Mantenimiento piscina con clorador salino', 1, 14000],
        ['Sal (sacos de 25 kg)', 2, 950],
      ],
    ],
  ];
  invoices.forEach(([clientKey, descripcion, lines]) => {
    const id = demoId(`invoice:${clientKey}`);
    data.invoice.push({
      id,
      org_id: org,
      series_id: series,
      client_id: demoId(`client:${clientKey}`),
      status: 'draft',
      descripcion,
      tipo_factura: 'F1',
      notes: 'Borrador de la demo.',
    });
    lines.forEach(([description, quantity, cents], n) =>
      data.invoice_line.push({
        id: demoId(`line:${clientKey}:${n}`),
        org_id: org,
        invoice_id: id,
        line_no: n + 1,
        description,
        quantity,
        unit_price_cents: cents,
        tax_rate: 21,
      }),
    );
  });

  files.push({ path: `${org}/branding/logo`, kind: 'logo', seed: 'logo' });
  return { data, files };
}
