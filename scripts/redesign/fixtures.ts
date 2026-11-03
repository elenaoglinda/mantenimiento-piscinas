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
  // Four months of visits to Villa Mar (both vasos), for the history, trend and last-state
  // screens. Newest first, like the app's queries.
  ...Array.from({ length: 24 }, (_, i) => ({
    id: `hist-${i + 1}`,
    org_id: ORG,
    pool_id: 'pool-1',
    basin_id: i % 3 === 2 ? 'bas-2' : 'bas-1',
    technician_id: i % 2 ? 'user-0002' : USER,
    visited_at: iso(4 + i * 5),
    status: i < 2 ? 'completed' : 'signed',
    signed_at: i < 2 ? null : iso(4 + i * 5),
    analysis_type: 'autocontrol',
    notes: null,
  })),
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
    siloe_param_id: 10,
    name_es: 'Cloro libre',
    unit: 'mg/L',
    min_ok: 0.5,
    max_ok: 2,
  },
  {
    ...paramBase,
    id: 'pd-2',
    siloe_param_id: 9,
    name_es: 'Cloro combinado',
    unit: 'mg/L',
    min_ok: null,
    max_ok: 0.6,
  },
  {
    ...paramBase,
    id: 'pd-3',
    siloe_param_id: 1,
    name_es: 'pH',
    unit: null,
    min_ok: 7.2,
    max_ok: 8,
  },
  {
    ...paramBase,
    id: 'pd-4',
    siloe_param_id: 6,
    name_es: 'Turbidez',
    unit: 'UNF',
    min_ok: null,
    max_ok: 5,
  },
  {
    ...paramBase,
    id: 'pd-5',
    siloe_param_id: 3,
    name_es: 'Temperatura',
    unit: '°C',
    min_ok: null,
    max_ok: 36,
  },
  {
    ...paramBase,
    id: 'pd-6',
    siloe_param_id: 7,
    name_es: 'Ácido isocianúrico',
    unit: 'mg/L',
    min_ok: null,
    max_ok: 75,
  },
  // Outside SILOÉ: no SILOÉ id, recommended ranges (service log).
  ...[
    ['pd-7', 'alcalinidad_total', 'Alcalinidad total', 'mg/L CaCO3', 80, 120],
    ['pd-8', 'dureza_calcica', 'Dureza cálcica', 'mg/L CaCO3', 200, 400],
    ['pd-9', 'sal', 'Sal', 'g/L', 3, 5],
    ['pd-10', 'fosfatos', 'Fosfatos', 'mg/L', null, 0.1],
  ].map(([id, clave, name_es, unit, min_ok, max_ok]) => ({
    ...paramBase,
    id: id as string,
    siloe_param_id: null as unknown as number,
    in_siloe: false,
    clave,
    name_es: name_es as string,
    unit: unit as string,
    min_ok: min_ok as number | null,
    max_ok: max_ok as number,
  })),
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

/** Plausible readings for the hist-N visits: a gentle drift with a few amber/red ones. */
function historyReadings() {
  const out: ReturnType<typeof reading>[] = [];
  const status = (v: number, lo: number | null, hi: number) =>
    (lo != null && v < lo) || v > hi
      ? 'red'
      : (lo != null && v < lo + (hi - lo) * 0.1) || v > hi - (hi - (lo ?? 0)) * 0.1
        ? 'amber'
        : 'green';
  for (let i = 0; i < 24; i++) {
    const r = `hist-${i + 1}`;
    const cl = [1.1, 0.4, 1.3, 0.9, 1.6, 1.0, 2.3, 1.2][i % 8];
    const ph = [7.4, 7.6, 7.3, 7.8, 7.5, 8.3, 7.4, 7.7][i % 8];
    const cc = [0.2, 0.3, 0.1, 0.4, 0.2, 0.7, 0.3, 0.2][i % 8];
    const temp = [27, 28, 26.5, 27.5, 29, 28.5, 26, 27][i % 8];
    out.push(
      reading(`hm-${i}-cl`, r, 'pd-1', cl, status(cl, 0.5, 2)),
      reading(`hm-${i}-cc`, r, 'pd-2', cc, status(cc, null, 0.6)),
      reading(`hm-${i}-ph`, r, 'pd-3', ph, status(ph, 7.2, 8)),
      reading(`hm-${i}-t`, r, 'pd-5', temp, status(temp, null, 36)),
    );
  }
  return out;
}

const at = (hh: number, mm: number) => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const lastYear = new Date().getFullYear() - 1;

const series = {
  id: 'ser-1',
  org_id: ORG,
  code: String(new Date().getFullYear()),
  description: 'Serie',
  archived: false,
  created_at: iso(60),
};
const line = (id: string, inv: string, description: string, qty: number, unit: number) => ({
  id,
  org_id: ORG,
  invoice_id: inv,
  line_no: 0,
  description,
  quantity: qty,
  unit_price_cents: unit,
  base_cents: qty * unit,
  tax_rate: 21,
  created_at: iso(10),
  updated_at: iso(10),
});
const invoice = (
  id: string,
  number: number | null,
  client: (typeof clients)[number],
  base: number,
  extra: Record<string, unknown>,
) => ({
  id,
  org_id: ORG,
  series_id: series.id,
  client_id: client.id,
  number,
  descripcion: 'Mantenimiento piscina — octubre',
  tipo_factura: 'F1',
  status: 'issued',
  send_status: 'accepted',
  payment_status: 'pending',
  aeat_estado: 'Correcta',
  base_cents: base,
  tax_cents: Math.round(base * 0.21),
  total_cents: Math.round(base * 1.21),
  issue_date: day(-5),
  due_date: day(25),
  created_at: iso(5),
  updated_at: iso(1),
  rectifies_invoice_id: null,
  replaced_by_invoice_id: null,
  verifacti_huella: 'A1B2C3D4E5F6',
  aeat_csv: null,
  aeat_url: null,
  last_error: null,
  send_attempts: 1,
  client: { name: client.name, cif_nif: client.cif_nif },
  invoice_series: { code: series.code },
  invoice_line: [line(`${id}-l1`, id, 'Mantenimiento mensual', 1, base)],
  ...extra,
});
const invoices = [
  invoice('inv-1', 7, clients[1], 48000, {}),
  invoice('inv-2', 6, clients[0], 24000, {
    payment_status: 'paid',
    issue_date: day(-35),
    due_date: day(-5),
  }),
  invoice('inv-3', 5, clients[1], 18000, { issue_date: day(-60), due_date: day(-30) }),
  invoice('inv-4', null, clients[0], 0, {
    status: 'draft',
    send_status: 'not_sent',
    aeat_estado: null,
    issue_date: null,
    due_date: null,
    verifacti_huella: null,
    invoice_line: [],
    tax_cents: 0,
    total_cents: 0,
  }),
];

export const tables: Record<string, Record<string, unknown>[]> = {
  billing_profile: [
    {
      id: 'bp-1',
      org_id: ORG,
      nif: 'B12345674',
      razon_social: 'Piscinas Mediterráneo SL',
      direccion: 'C/ Larios 4',
      cp: '29005',
      municipio: 'Málaga',
      provincia: 'Málaga',
      pais: 'ES',
      created_at: iso(60),
      updated_at: iso(60),
    },
  ],
  invoice_series: [series],
  invoice: invoices,
  invoice_activity: [],
  invitation: [
    {
      id: 'invite-1',
      org_id: ORG,
      email: 'marta@example.com',
      role: 'technician',
      status: 'pending',
      token: 'demo-token',
      created_at: iso(2),
    },
  ],
  invoice_aeat_record: [],
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
    ...historyReadings(),
  ],
  chemical_product: [
    ['Cloro granulado', 'kg', 0.5],
    ['Cloro en pastillas', 'pastillas', 2],
    ['Minorador de pH', 'kg', null],
    ['Incrementador de pH', 'kg', null],
    ['Floculante', 'L', 0.25],
    ['Alguicida', 'L', null],
    ['Clarificante', 'L', null],
    ['Sal', 'kg', null],
  ].map(([nombre, unidad, cantidad], i) => ({
    id: `chem-${i + 1}`,
    org_id: ORG,
    nombre,
    unidad,
    cantidad_habitual: cantidad,
    activo: true,
    orden: i + 1,
    created_at: iso(90),
    updated_at: iso(90),
  })),
  task_def: [
    'Barrido / limpieza de fondo',
    'Limpieza de paredes y línea de flotación',
    'Vaciado de skimmers y prefiltro',
    'Contralavado del filtro',
    'Limpieza del filtro',
    'Revisión de bomba y equipos',
    'Revisión del clorador salino',
    'Retirada de hojas',
  ].map((nombre, i) => ({
    id: `task-${i + 1}`,
    org_id: ORG,
    nombre,
    orden: i + 1,
    activo: true,
    created_at: iso(90),
    updated_at: iso(90),
  })),
  report_task: [
    { id: 'rt-1', org_id: ORG, report_id: 'hist-1', task_id: 'task-1', hecho: true, nota: null },
    {
      id: 'rt-2',
      org_id: ORG,
      report_id: 'hist-1',
      task_id: 'task-3',
      hecho: true,
      nota: 'Mucha hoja',
    },
    { id: 'rt-3', org_id: ORG, report_id: 'hist-1', task_id: 'task-4', hecho: true, nota: null },
  ],
  // What was added at the two latest visits to Villa Mar.
  report_chemical: [
    {
      id: 'rc-1',
      org_id: ORG,
      report_id: 'hist-1',
      product_id: 'chem-1',
      cantidad: 0.5,
      unidad: 'kg',
      created_at: iso(4),
    },
    {
      id: 'rc-2',
      org_id: ORG,
      report_id: 'hist-1',
      product_id: 'chem-5',
      cantidad: 0.25,
      unidad: 'L',
      created_at: iso(4),
    },
    {
      id: 'rc-3',
      org_id: ORG,
      report_id: 'hist-2',
      product_id: 'chem-3',
      cantidad: 1,
      unidad: 'kg',
      created_at: iso(9),
    },
  ],
  incident: [
    {
      id: 'inc-1',
      org_id: ORG,
      report_id: 'hist-1',
      description: 'Skimmer del lado norte roto',
      corrective_action: null,
      created_at: iso(4),
    },
    {
      id: 'inc-2',
      org_id: ORG,
      report_id: 'hist-6',
      description: 'pH alto tras lluvia',
      corrective_action: 'Dosificación de minorador de pH',
      created_at: iso(29),
    },
  ],
  attachment: [
    { id: 'att-1', org_id: ORG, report_id: 'hist-1', kind: 'photo', storage_path: 'x/1.jpg' },
    { id: 'att-2', org_id: ORG, report_id: 'hist-1', kind: 'photo', storage_path: 'x/2.jpg' },
    { id: 'att-3', org_id: ORG, report_id: 'hist-4', kind: 'lab_pdf', storage_path: 'x/3.pdf' },
  ],
  annual_result: [
    {
      id: 'ar-1',
      org_id: ORG,
      basin_id: 'bas-1',
      year: lastYear,
      analysis_type: 'autocontrol',
      laboratorio: 'LAB-0291',
      fecha_apertura: `${lastYear}-06-01`,
      fecha_cierre: `${lastYear}-09-30`,
      dias_apertura: 122,
      n_iniciales: 1,
      n_rutina: 34,
      n_periodicos: 4,
      punto_muestreo: 2,
      created_at: iso(20),
      basin: { denominacion: 'Vaso principal' },
      annual_result_param: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
    },
    {
      id: 'ar-2',
      org_id: ORG,
      basin_id: 'bas-3',
      year: lastYear,
      analysis_type: 'autocontrol',
      laboratorio: null,
      fecha_apertura: `${lastYear}-05-15`,
      fecha_cierre: null,
      dias_apertura: null,
      n_iniciales: 1,
      n_rutina: 28,
      n_periodicos: 3,
      punto_muestreo: 2,
      created_at: iso(20),
      basin: { denominacion: 'Vaso exterior' },
      annual_result_param: [{ id: 'p5' }, { id: 'p6' }],
    },
  ],
  xml_export: [
    {
      id: 'x-1',
      org_id: ORG,
      kind: 'resultado_anual',
      period_year: lastYear - 1,
      item_count: 3,
      file_path: null,
      created_by: USER,
      created_at: iso(340),
    },
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

/** Other people in the org, for the Equipo page and the technician filter. */
export const teamMembers = [
  {
    id: 'user-0002',
    org_id: ORG,
    role: 'technician',
    full_name: 'Juan Pérez',
    email: 'juan@example.com',
    dni_nif: null,
    created_at: iso(40),
    updated_at: iso(40),
  },
];

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

// History screens embed each visit's readings, incidents, files and technician (and the pool's
// client and region). The fake backend doesn't resolve embeds, so attach them here.
for (const r of tables.report) {
  const pool = pools.find((p) => p.id === r.pool_id)!;
  const tech = [appUser, ...teamMembers].find((u) => u.id === r.technician_id);
  Object.assign(r, {
    pool: {
      denominacion: pool.denominacion,
      client_id: pool.client_id,
      ccaa: null,
      client: pool.client,
    },
    technician: tech ? { full_name: tech.full_name, email: tech.email } : null,
    measurement: tables.measurement.filter((m) => m.report_id === r.id),
    incident: tables.incident.filter((m) => m.report_id === r.id),
    attachment: tables.attachment.filter((m) => m.report_id === r.id),
  });
}
for (const m of tables.measurement) {
  const r = tables.report.find((x) => x.id === m.report_id)!;
  Object.assign(m, {
    report: {
      visited_at: r.visited_at,
      pool_id: r.pool_id,
      basin_id: r.basin_id,
      technician_id: r.technician_id,
      status: r.status,
    },
  });
}

for (const rc of tables.report_chemical) {
  const p = tables.chemical_product.find((x) => x.id === rc.product_id)!;
  Object.assign(rc, { chemical_product: { nombre: p.nombre } });
}

for (const rt of tables.report_task) {
  const d = tables.task_def.find((x) => x.id === rt.task_id)!;
  Object.assign(rt, { task_def: { nombre: d.nombre, orden: d.orden } });
}
