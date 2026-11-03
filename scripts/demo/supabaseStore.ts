/**
 * The demo seed's database adapter: Supabase with the SERVICE-ROLE key, which bypasses RLS.
 * That's why it lives in a script run by hand from a terminal and never in a request path,
 * and why every write is scoped to the demo org id (run.ts checks the name first).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { paramKey } from '../../packages/shared/src/service-log/params.js';
import {
  DEMO_ORG_ID,
  type DemoFile,
  type DemoParamDef,
  type DemoTable,
  type Row,
} from './generate.js';
import { logo, poolPhoto, signature } from './images.js';
import type { DemoStore } from './run.js';

const BUCKET = 'reports';

/**
 * Children that would block the org's cascade (restrict foreign keys) are deleted first;
 * deleting the org then cascades to everything else that has its org_id. CI runs this exact
 * order against Postgres (scripts/demo/to-sql.ts wipe).
 */
export const WIPE_ORDER = [
  'report',
  'route',
  'invoice',
  'invoice_series',
  'pool',
  'client',
] as const;

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'error desconocido'}`);
}

/** Every object under `prefix`, walking folders (storage lists one level at a time). */
async function listAll(sb: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) fail(`listar ${prefix}`, error);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Folders come back without an id.
      if (item.id === null) out.push(...(await listAll(sb, path)));
      else out.push(path);
    }
    if ((data ?? []).length < 1000) return out;
  }
}

export function supabaseStore(sb: SupabaseClient): DemoStore {
  return {
    async findUserByEmail(email) {
      for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) fail('listar usuarios', error);
        const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (hit) return { id: hit.id };
        if (data.users.length < 1000) return null;
      }
    },

    async createUser(email, fullName) {
      // Confirmed, no password: the person signs in with a magic link (or sets a password
      // with "¿Has olvidado tu contraseña?"). No credential is printed or stored.
      const { data, error } = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) fail(`crear usuario ${email}`, error);
      return { id: data.user.id };
    },

    async membership(userId) {
      const { data, error } = await sb
        .from('app_user')
        .select('org_id, org(name)')
        .eq('id', userId)
        .maybeSingle();
      if (error) fail('leer app_user', error);
      if (!data) return null;
      // A to-one embed comes back as an object (typed as an array without generated types).
      const row = data as unknown as {
        org_id: string;
        org: { name: string } | { name: string }[] | null;
      };
      const org = Array.isArray(row.org) ? row.org[0] : row.org;
      return { orgId: row.org_id, orgName: org?.name ?? '' };
    },

    async getOrg(id) {
      const { data, error } = await sb.from('org').select('id, name').eq('id', id).maybeSingle();
      if (error) fail('leer org', error);
      return data as { id: string; name: string } | null;
    },

    async countIssuedInvoices(orgId) {
      const { count, error } = await sb
        .from('invoice')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('status', 'draft');
      if (error) fail('contar facturas', error);
      return count ?? 0;
    },

    async wipeOrg(orgId) {
      if (orgId !== DEMO_ORG_ID) throw new Error('wipeOrg solo borra la organización demo.');
      const files = await listAll(sb, orgId);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await sb.storage.from(BUCKET).remove(files.slice(i, i + 100));
        if (error) fail('borrar archivos', error);
      }
      for (const table of WIPE_ORDER) {
        const { error } = await sb.from(table).delete().eq('org_id', orgId);
        if (error) fail(`borrar ${table}`, error);
      }
      const { error } = await sb.from('org').delete().eq('id', orgId);
      if (error) fail('borrar org', error);
    },

    async nationalParams() {
      const { data, error } = await sb
        .from('parameter_def')
        .select('*')
        .eq('active', true)
        .is('ccaa', null);
      if (error) fail('leer parameter_def', error);
      const out: DemoParamDef[] = [];
      for (const d of (data ?? []) as Record<string, unknown>[]) {
        const key = paramKey(
          d as { siloe_param_id: number | null; in_siloe?: boolean | null; clave?: string | null },
        );
        if (key == null) continue;
        out.push({
          id: String(d.id),
          key,
          minOk: d.min_ok as number | null,
          maxOk: d.max_ok as number | null,
          minWarn: d.min_warn as number | null,
          maxWarn: d.max_warn as number | null,
          closureMin: d.closure_min as number | null,
          closureMax: d.closure_max as number | null,
          warnMarginRatio: (d.warn_margin_ratio as number | null) ?? undefined,
        });
      }
      return out;
    },

    async insert(table: DemoTable, rows: Row[]) {
      for (let i = 0; i < rows.length; i += 500) {
        const part = rows.slice(i, i + 500);
        // app_user: a login may move here from another demo org, so upsert on its id.
        const { error } =
          table === 'app_user'
            ? await sb.from(table).upsert(part, { onConflict: 'id' })
            : await sb.from(table).insert(part);
        if (error) fail(`insertar ${table}`, error);
      }
    },

    async upload(file: DemoFile) {
      const bytes =
        file.kind === 'logo'
          ? logo()
          : file.kind === 'signature'
            ? signature(file.seed)
            : poolPhoto(file.seed);
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(file.path, bytes, { contentType: 'image/png', upsert: true });
      if (error) fail(`subir ${file.path}`, error);
    },

    async renameOrg(id, name) {
      const { error } = await sb.from('org').update({ name }).eq('id', id);
      if (error) fail('renombrar org', error);
    },

    async ensureAdmin(userId, orgId, email) {
      const { error } = await sb
        .from('app_user')
        .upsert(
          { id: userId, org_id: orgId, role: 'admin', email, full_name: 'Administración (demo)' },
          { onConflict: 'id' },
        );
      if (error) fail('dar acceso al administrador', error);
    },
  };
}
