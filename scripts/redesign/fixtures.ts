/**
 * Fake Supabase backend for the screenshot harness. Plausible pool-maintenance data so pages
 * render in a realistic state; shapes mirror the embeds the pages actually select.
 */
const ORG = 'org-0001';
const USER = 'user-0001';

export const ids = { ORG, USER };

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const day = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

const org = {
  id: ORG,
  name: 'Piscinas Mediterráneo SL',
  type: 'company',
  created_at: iso(90),
  updated_at: iso(1),
  onboarding_dismissed_at: null,
};

const clients = [
  {
    id: 'cli-1',
    org_id: ORG,
    name: 'Comunidad Villa Mar',
    cif_nif: 'H12345678',
    contact_email: 'admin@villamar.es',
    contact_phone: '600111222',
    is_self: false,
    archived: false,
    notes: null,
    created_at: iso(80),
    updated_at: iso(5),
  },
  {
    id: 'cli-2',
    org_id: ORG,
    name: 'Hotel Las Palmeras',
    cif_nif: 'B87654321',
    contact_email: 'mantenimiento@palmeras.es',
    contact_phone: '600333444',
    is_self: false,
    archived: false,
    notes: null,
    created_at: iso(70),
    updated_at: iso(3),
  },
];

const pools = [
  {
    id: 'pool-1',
    org_id: ORG,
    client_id: 'cli-1',
    denominacion: 'Villa Mar · Piscina comunitaria',
    pool_type: 'tipo_2',
    municipio: 'Marbella',
    provincia: 'Málaga',
    direccion: 'Av. del Mar 12',
    lat: 36.5101,
    lng: -4.8825,
    archived: false,
    siloe_cod_p: 'P-29069-001',
    created_at: iso(60),
    updated_at: iso(2),
  },
  {
    id: 'pool-2',
    org_id: ORG,
    client_id: 'cli-2',
    denominacion: 'Las Palmeras · Piscina exterior',
    pool_type: 'tipo_1',
    municipio: 'Estepona',
    provincia: 'Málaga',
    direccion: 'Ctra. Cádiz km 160',
    lat: 36.4428,
    lng: -5.1196,
    archived: false,
    siloe_cod_p: null,
    created_at: iso(55),
    updated_at: iso(4),
  },
  {
    id: 'pool-3',
    org_id: ORG,
    client_id: 'cli-2',
    denominacion: 'Las Palmeras · Spa',
    pool_type: 'tipo_1',
    municipio: 'Estepona',
    provincia: 'Málaga',
    direccion: 'Ctra. Cádiz km 160',
    lat: 36.4428,
    lng: -5.1196,
    archived: false,
    siloe_cod_p: null,
    created_at: iso(50),
    updated_at: iso(6),
  },
].map((p) => ({
  ...p,
  // Non-null in the schema; the detail page and report form read them directly.
  agua_alimentacion: ['red_publica'],
  client: { name: clients.find((c) => c.id === p.client_id)!.name, is_self: false },
}));

const basinBase = {
  org_id: ORG,
  capacidad_m3: 180,
  lamina_m2: 120,
  prof_min: 1.1,
  prof_max: 2.2,
  clase: null,
  fecha_baja: null,
  observaciones: null,
  siloe_cod_v: null,
  siloe_cod_v_p: null,
  tipo_vaso: ['recreativo'],
  // The detail page selects `*, treatment(*)`, which always embeds an array.
  treatment: [] as Record<string, unknown>[],
  created_at: iso(50),
  updated_at: iso(5),
};
const basins = [
  {
    ...basinBase,
    id: 'bas-1',
    pool_id: 'pool-1',
    denominacion: 'Vaso principal',
    num_orden: 1,
    siloe_cod_v: 'V-001',
    treatment: [
      { id: 'tr-1', basin_id: 'bas-1', kind: 'desinfeccion', comercial: 'Hipoclorito sódico 15 %' },
    ],
  },
  {
    ...basinBase,
    id: 'bas-2',
    pool_id: 'pool-1',
    denominacion: 'Chapoteo',
    num_orden: 2,
    capacidad_m3: 12,
  },
  { ...basinBase, id: 'bas-3', pool_id: 'pool-2', denominacion: 'Vaso exterior', num_orden: 1 },
  {
    ...basinBase,
    id: 'bas-4',
    pool_id: 'pool-3',
    denominacion: 'Spa',
    num_orden: 1,
    capacidad_m3: 8,
  },
];
for (const p of pools) {
  (p as Record<string, unknown>).basin = basins.filter((b) => b.pool_id === p.id);
}

const reports = [
  {
    id: 'rep-1',
    org_id: ORG,
    pool_id: 'pool-1',
    basin_id: 'bas-1',
    technician_id: USER,
    visited_at: iso(1),
    status: 'signed',
    signed_by_name: 'Juan Pérez',
    signed_by_dni: '12345678Z',
    signed_at: iso(1),
    analysis_type: 'autocontrol',
    notes: null,
  },
  {
    id: 'rep-2',
    org_id: ORG,
    pool_id: 'pool-2',
    basin_id: 'bas-3',
    technician_id: USER,
    visited_at: iso(2),
    status: 'completed',
    analysis_type: 'autocontrol',
    notes: null,
  },
  {
    id: 'rep-3',
    org_id: ORG,
    pool_id: 'pool-3',
    basin_id: 'bas-4',
    technician_id: USER,
    visited_at: iso(3),
    status: 'draft',
    analysis_type: 'autocontrol',
    notes: null,
  },
].map((r) => ({
  ...r,
  pool: { denominacion: pools.find((p) => p.id === r.pool_id)!.denominacion },
  basin: { denominacion: basins.find((b) => b.id === r.basin_id)!.denominacion },
}));

const paramBase = {
  ccaa: null,
  active: true,
  min_warn: null,
  max_warn: null,
  closure_min: null,
  closure_max: null,
  warn_margin_ratio: 0.1,
};
const parameterDefs = [
  {
    ...paramBase,
    id: 'pd-1',
    siloe_param_id: 1,
    name_es: 'Cloro libre',
    unit: 'mg/L',
    min_ok: 0.5,
    max_ok: 2,
  },
  {
    ...paramBase,
    id: 'pd-2',
    siloe_param_id: 2,
    name_es: 'Cloro combinado',
    unit: 'mg/L',
    min_ok: null,
    max_ok: 0.6,
  },
  {
    ...paramBase,
    id: 'pd-3',
    siloe_param_id: 3,
    name_es: 'pH',
    unit: null,
    min_ok: 7.2,
    max_ok: 8,
  },
  {
    ...paramBase,
    id: 'pd-4',
    siloe_param_id: 4,
    name_es: 'Turbidez',
    unit: 'UNF',
    min_ok: null,
    max_ok: 5,
  },
  {
    ...paramBase,
    id: 'pd-5',
    siloe_param_id: 5,
    name_es: 'Temperatura',
    unit: '°C',
    min_ok: null,
    max_ok: 36,
  },
  {
    ...paramBase,
    id: 'pd-6',
    siloe_param_id: 6,
    name_es: 'Ácido isocianúrico',
    unit: 'mg/L',
    min_ok: null,
    max_ok: 75,
  },
];
const reading = (id: string, report: string, def: string, value: number, status: string) => {
  const d = parameterDefs.find((x) => x.id === def)!;
  return {
    id,
    org_id: ORG,
    report_id: report,
    parameter_def_id: def,
    value,
    status,
    compliant: status !== 'red',
    lugar: 'in_situ',
    metodo: null,
    parameter_def: { name_es: d.name_es, unit: d.unit },
  };
};

const at = (hh: number, mm: number) => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const lastYear = new Date().getFullYear() - 1;

export const tables: Record<string, Record<string, unknown>[]> = {
  org: [org],
  client: clients,
  pool: pools,
  report: reports,
  basin: basins,
  route: [
    { id: 'route-1', org_id: ORG, technician_id: USER, route_date: day(0), created_at: iso(1) },
  ],
  route_stop: [
    {
      id: 'st-1',
      org_id: ORG,
      route_id: 'route-1',
      pool_id: 'pool-1',
      seq: 1,
      eta: at(9, 15),
      leg_s: 900,
      created_at: iso(1),
    },
    {
      id: 'st-2',
      org_id: ORG,
      route_id: 'route-1',
      pool_id: 'pool-2',
      seq: 2,
      eta: at(10, 40),
      leg_s: 1500,
      created_at: iso(1),
    },
    {
      id: 'st-3',
      org_id: ORG,
      route_id: 'route-1',
      pool_id: 'pool-3',
      seq: 3,
      eta: at(11, 30),
      leg_s: 300,
      created_at: iso(1),
    },
  ],
  // One out-of-range reading, so the dashboard's alerts have something to show.
  parameter_def: parameterDefs,
  measurement: [
    reading('m-1', 'rep-1', 'pd-1', 1.2, 'green'),
    reading('m-2', 'rep-1', 'pd-2', 0.3, 'green'),
    reading('m-3', 'rep-1', 'pd-3', 7.6, 'green'),
    reading('m-4', 'rep-1', 'pd-4', 0.8, 'green'),
    reading('m-5', 'rep-2', 'pd-1', 3.4, 'red'),
    reading('m-6', 'rep-2', 'pd-3', 7.9, 'amber'),
  ],
  annual_result: [
    { id: 'ar-1', org_id: ORG, basin_id: 'bas-1', year: lastYear, analysis_type: 'autocontrol' },
    { id: 'ar-2', org_id: ORG, basin_id: 'bas-3', year: lastYear, analysis_type: 'autocontrol' },
  ],
};

/** The profile query embeds the org; everything else is a plain table read. */
export const appUser = {
  id: USER,
  org_id: ORG,
  role: 'admin',
  full_name: 'Elena Oglinda',
  email: 'elena@example.com',
  dni_nif: null,
  created_at: iso(90),
  updated_at: iso(1),
  org,
};

export const session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  user: {
    id: USER,
    aud: 'authenticated',
    role: 'authenticated',
    email: appUser.email,
    app_metadata: {},
    user_metadata: {},
    created_at: iso(90),
  },
};
