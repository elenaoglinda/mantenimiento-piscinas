/**
 * What the demo seed does, independent of how it talks to the database (the Supabase adapter
 * is supabaseStore.ts; the tests use an in-memory one). Every rule that protects real data is
 * here, so it is tested:
 *
 *   1. Only an org whose name ends in "(demo)" is ever wiped or written to.
 *   2. The admin e-mail must not belong to a real (non-demo) org: the seed would otherwise move
 *      a real person's login into the demo.
 *   3. Without --reset an existing, complete demo is left alone (idempotent). A half-made one
 *      (a run that died) still has its "creando…" name and is rebuilt.
 *   4. A demo with an issued invoice is never wiped (issued invoices are fiscal records);
 *      the seed stops and says so. The demo has no billing profile, so this should not happen.
 */
import {
  DEMO_ORG_ID,
  DEMO_ORG_NAME,
  DEMO_TABLES,
  generateDemo,
  isDemoOrgName,
  type DemoFile,
  type DemoParamDef,
  type DemoTable,
  type Row,
} from './generate.js';

export interface DemoStore {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUser(email: string, fullName: string): Promise<{ id: string }>;
  /** The org a login belongs to in the app, if any. */
  membership(userId: string): Promise<{ orgId: string; orgName: string } | null>;
  getOrg(id: string): Promise<{ id: string; name: string } | null>;
  countIssuedInvoices(orgId: string): Promise<number>;
  /** Deletes the org's rows and its storage folder. Only ever called after the name check. */
  wipeOrg(orgId: string): Promise<void>;
  nationalParams(): Promise<DemoParamDef[]>;
  insert(table: DemoTable, rows: Row[]): Promise<void>;
  upload(file: DemoFile): Promise<void>;
  renameOrg(id: string, name: string): Promise<void>;
  /** Makes `userId` an admin of the demo org (insert or update of app_user). */
  ensureAdmin(userId: string, orgId: string, email: string): Promise<void>;
}

export class RefusedError extends Error {}

export const TECHNICIANS = [
  { email: 'demo.tecnico.lucia@example.com', fullName: 'Lucía Ferrer' },
  { email: 'demo.tecnico.javier@example.com', fullName: 'Javier Martí' },
] as const;

export interface SeedOptions {
  adminEmail: string;
  reset: boolean;
  /** Madrid day the 90 days end on, 'YYYY-MM-DD'. */
  today: string;
  log?: (line: string) => void;
}

export type SeedResult =
  | { action: 'exists'; orgId: string }
  | {
      action: 'created' | 'reset' | 'repaired';
      orgId: string;
      counts: Partial<Record<DemoTable, number>>;
      files: number;
    };

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

async function userFor(
  store: DemoStore,
  email: string,
  fullName: string,
  log: (l: string) => void,
) {
  const found = await store.findUserByEmail(email);
  const user = found ?? (await store.createUser(email, fullName));
  if (!found) log(`  usuario creado: ${email}`);
  const m = await store.membership(user.id);
  if (m && m.orgId !== DEMO_ORG_ID && !isDemoOrgName(m.orgName)) {
    throw new RefusedError(
      `El correo ${email} ya pertenece a la organización «${m.orgName}», que no es una demo. ` +
        'Usa un correo solo para la demo (por ejemplo, demo@tu-dominio).',
    );
  }
  return user;
}

export async function runSeed(store: DemoStore, opts: SeedOptions): Promise<SeedResult> {
  const log = opts.log ?? (() => {});
  const adminEmail = opts.adminEmail.trim().toLowerCase();
  if (!EMAIL.test(adminEmail)) throw new RefusedError(`Correo no válido: «${opts.adminEmail}».`);

  // Rule 1 before anything else: what is at the demo's id must be a demo.
  const existing = await store.getOrg(DEMO_ORG_ID);
  if (existing && !isDemoOrgName(existing.name)) {
    throw new RefusedError(
      `La organización ${existing.id} se llama «${existing.name}», que no termina en «(demo)». No se toca.`,
    );
  }

  const admin = await userFor(store, adminEmail, 'Administración (demo)', log);

  if (existing && existing.name === DEMO_ORG_NAME && !opts.reset) {
    await store.ensureAdmin(admin.id, DEMO_ORG_ID, adminEmail);
    log(
      `La demo ya existe (${DEMO_ORG_NAME}); no se ha cambiado nada. Usa --reset para regenerarla.`,
    );
    return { action: 'exists', orgId: DEMO_ORG_ID };
  }

  if (existing) {
    // Re-check right before deleting, on the row as it is now.
    const current = await store.getOrg(DEMO_ORG_ID);
    if (!current || !isDemoOrgName(current.name))
      throw new RefusedError('La organización cambió de nombre; no se borra.');
    const issued = await store.countIssuedInvoices(DEMO_ORG_ID);
    if (issued > 0) {
      throw new RefusedError(
        `La demo tiene ${issued} factura(s) emitida(s). Una factura emitida es un registro fiscal y no se borra; ` +
          'revisa la cuenta demo antes de regenerarla.',
      );
    }
    log(
      existing.name === DEMO_ORG_NAME
        ? 'Borrando la demo anterior…'
        : 'Una ejecución anterior no terminó; rehaciendo…',
    );
    await store.wipeOrg(DEMO_ORG_ID);
  }

  const technicians = [];
  for (const t of TECHNICIANS) {
    const u = await userFor(store, t.email, t.fullName, log);
    technicians.push({ id: u.id, email: t.email, fullName: t.fullName });
  }
  const params = await store.nationalParams();
  const { data, files } = generateDemo({
    today: opts.today,
    admin: { id: admin.id, email: adminEmail, fullName: 'Administración (demo)' },
    technicians: [technicians[0]!, technicians[1]!],
    params,
  });

  const counts: Partial<Record<DemoTable, number>> = {};
  for (const table of DEMO_TABLES) {
    await store.insert(table, data[table]);
    counts[table] = data[table].length;
  }
  log(
    `  ${data.report.length} visitas, ${data.measurement.length} lecturas, ${data.route_stop.length} paradas`,
  );
  for (const f of files) await store.upload(f);
  log(`  ${files.length} archivos (fotos, firmas, logotipo)`);
  // Last: only a run that got this far has the final name.
  await store.renameOrg(DEMO_ORG_ID, DEMO_ORG_NAME);

  return {
    action: !existing ? 'created' : existing.name === DEMO_ORG_NAME ? 'reset' : 'repaired',
    orgId: DEMO_ORG_ID,
    counts,
    files: files.length,
  };
}
