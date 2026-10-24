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
    archived: false,
    siloe_cod_p: null,
    created_at: iso(50),
    updated_at: iso(6),
  },
].map((p) => ({
  ...p,
  // Non-null in the schema; the detail page and report form read them directly.
  agua_alimentacion: ['red_publica'],
  basin: [],
  client: { name: clients.find((c) => c.id === p.client_id)!.name, is_self: false },
}));

const reports = [
  {
    id: 'rep-1',
    org_id: ORG,
    pool_id: 'pool-1',
    basin_id: null,
    technician_id: USER,
    visited_at: iso(1),
    status: 'signed',
    analysis_type: 'autocontrol',
    notes: null,
  },
  {
    id: 'rep-2',
    org_id: ORG,
    pool_id: 'pool-2',
    basin_id: null,
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
    basin_id: null,
    technician_id: USER,
    visited_at: iso(3),
    status: 'draft',
    analysis_type: 'autocontrol',
    notes: null,
  },
].map((r) => ({
  ...r,
  pool: { denominacion: pools.find((p) => p.id === r.pool_id)!.denominacion },
  basin: null,
}));

export const tables: Record<string, Record<string, unknown>[]> = {
  org: [org],
  client: clients,
  pool: pools,
  report: reports,
  route: [
    { id: 'route-1', org_id: ORG, technician_id: USER, route_date: day(0), created_at: iso(1) },
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
