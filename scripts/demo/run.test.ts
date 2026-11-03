import { describe, expect, it } from 'vitest';
import { DEMO_ORG_ID, DEMO_ORG_NAME, demoId, type DemoTable, type Row } from './generate.js';
import { RefusedError, runSeed, type DemoStore } from './run.js';
import { TEST_PARAMS } from './testFixtures.js';

/** In-memory stand-in for Supabase, enough to check what the seed does and refuses. */
function memoryStore() {
  const db = {
    users: new Map<string, string>(), // email → id
    orgs: new Map<string, string>([['real-org', 'Piscinas Reales SL']]), // id → name
    appUsers: new Map<string, string>(), // user id → org id
    rows: new Map<DemoTable, Row[]>(),
    files: new Set<string>(),
    issued: 0,
    wipes: [] as string[],
  };
  let n = 0;
  const store: DemoStore = {
    async findUserByEmail(email) {
      const id = db.users.get(email);
      return id ? { id } : null;
    },
    async createUser(email) {
      const id = demoId(`user-${++n}`);
      db.users.set(email, id);
      return { id };
    },
    async membership(userId) {
      const orgId = db.appUsers.get(userId);
      return orgId ? { orgId, orgName: db.orgs.get(orgId) ?? '' } : null;
    },
    async getOrg(id) {
      const name = db.orgs.get(id);
      return name ? { id, name } : null;
    },
    async countIssuedInvoices() {
      return db.issued;
    },
    async wipeOrg(orgId) {
      db.wipes.push(orgId);
      db.orgs.delete(orgId);
      for (const [t, rows] of db.rows)
        db.rows.set(
          t,
          rows.filter((r) => r.org_id !== orgId && r.id !== orgId),
        );
      for (const [u, o] of db.appUsers) if (o === orgId) db.appUsers.delete(u);
      for (const f of db.files) if (f.startsWith(`${orgId}/`)) db.files.delete(f);
    },
    async nationalParams() {
      return TEST_PARAMS;
    },
    async insert(table, rows) {
      if (table === 'org') for (const r of rows) db.orgs.set(String(r.id), String(r.name));
      if (table === 'app_user')
        for (const r of rows) db.appUsers.set(String(r.id), String(r.org_id));
      db.rows.set(table, [...(db.rows.get(table) ?? []), ...rows]);
    },
    async upload(file) {
      db.files.add(file.path);
    },
    async renameOrg(id, name) {
      db.orgs.set(id, name);
    },
    async ensureAdmin(userId, orgId) {
      db.appUsers.set(userId, orgId);
    },
  };
  return { db, store };
}

const opts = { adminEmail: 'demo@example.com', reset: false, today: '2026-11-03' };
const snapshot = (db: ReturnType<typeof memoryStore>['db']) =>
  JSON.stringify({
    orgs: [...db.orgs],
    rows: [...db.rows].map(([t, r]) => [t, r.length, r.map((x) => x.id)]),
    files: [...db.files].sort(),
  });

describe('demo seed', () => {
  it('creates the demo org with its final name, admin included', async () => {
    const { db, store } = memoryStore();
    const res = await runSeed(store, opts);
    expect(res.action).toBe('created');
    expect(db.orgs.get(DEMO_ORG_ID)).toBe(DEMO_ORG_NAME);
    expect(db.appUsers.get(db.users.get('demo@example.com')!)).toBe(DEMO_ORG_ID);
    expect(db.rows.get('report')!.length).toBeGreaterThan(300);
    expect(db.files.size).toBeGreaterThan(20);
  });

  it('running it twice gives the same demo org and changes nothing the second time', async () => {
    const { db, store } = memoryStore();
    await runSeed(store, opts);
    const first = snapshot(db);
    const again = await runSeed(store, opts);
    expect(again.action).toBe('exists');
    expect(snapshot(db)).toBe(first);
    expect(db.wipes).toEqual([]);
  });

  it('--reset wipes only the demo org and regenerates the same org', async () => {
    const { db, store } = memoryStore();
    await runSeed(store, opts);
    const first = snapshot(db);
    const res = await runSeed(store, { ...opts, reset: true });
    expect(res.action).toBe('reset');
    expect(db.wipes).toEqual([DEMO_ORG_ID]);
    expect(snapshot(db)).toBe(first);
    expect(db.orgs.get('real-org')).toBe('Piscinas Reales SL');
  });

  it('rebuilds a demo a previous run left half-made', async () => {
    const { db, store } = memoryStore();
    db.orgs.set(DEMO_ORG_ID, 'Piscinas Mediterráneo (creando…) (demo)');
    const res = await runSeed(store, opts);
    expect(res.action).toBe('repaired');
    expect(db.wipes).toEqual([DEMO_ORG_ID]);
    expect(db.orgs.get(DEMO_ORG_ID)).toBe(DEMO_ORG_NAME);
  });

  it('refuses an org at the demo id whose name does not end in "(demo)"', async () => {
    const { db, store } = memoryStore();
    db.orgs.set(DEMO_ORG_ID, 'Piscinas Mediterráneo SL');
    await expect(runSeed(store, { ...opts, reset: true })).rejects.toThrow(RefusedError);
    expect(db.wipes).toEqual([]);
    expect(db.orgs.get(DEMO_ORG_ID)).toBe('Piscinas Mediterráneo SL');
  });

  it('refuses an admin e-mail that belongs to a real org', async () => {
    const { db, store } = memoryStore();
    db.users.set('sara@example.com', 'sara-id');
    db.appUsers.set('sara-id', 'real-org');
    await expect(runSeed(store, { ...opts, adminEmail: 'sara@example.com' })).rejects.toThrow(
      /Piscinas Reales SL/,
    );
    expect(db.appUsers.get('sara-id')).toBe('real-org');
    expect(db.orgs.has(DEMO_ORG_ID)).toBe(false);
  });

  it('never wipes a demo that has an issued invoice', async () => {
    const { db, store } = memoryStore();
    await runSeed(store, opts);
    db.issued = 1;
    await expect(runSeed(store, { ...opts, reset: true })).rejects.toThrow(/factura/);
    expect(db.wipes).toEqual([]);
  });

  it('rejects a malformed e-mail before touching anything', async () => {
    const { db, store } = memoryStore();
    await expect(runSeed(store, { ...opts, adminEmail: 'not-an-email' })).rejects.toThrow(
      RefusedError,
    );
    expect(db.users.size).toBe(0);
  });
});
