/**
 * Test-only in-memory stand-in for the supabase-js client the API uses: tables with the
 * query-builder methods report-pdf calls, and a storage bucket. Not a Vercel function
 * (underscore folder). Used by api/_tests and by the UI harness (scripts/redesign), which runs
 * the real PDF builder against its in-memory database.
 */
type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Tables that answer like a table missing from the schema cache (migration not applied). */
  missing?: Set<string>;
  /** Tables that fail with a generic database error. */
  broken?: Set<string>;
  storage: Map<string, Uint8Array>;
  /** Paths the caller may not write (RLS), e.g. a viewer. */
  readOnlyStorage?: boolean;
  uploads: string[];
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean }[] = [];
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private embed: string | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(cols = '*') {
    const m = /(\w+)\(\*\)/.exec(cols);
    this.embed = m ? m[1]! : null;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  gte(col: string, v: string) {
    this.filters.push((r) => String(r[col]) >= v);
    return this;
  }
  lt(col: string, v: string) {
    this.filters.push((r) => String(r[col]) < v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  private run(): { data: unknown; error: unknown } {
    if (this.db.missing?.has(this.table)) {
      return {
        data: null,
        error: { code: 'PGRST205', message: 'table not found', details: '', hint: '' },
      };
    }
    if (this.db.broken?.has(this.table)) {
      return {
        data: null,
        error: { code: '57014', message: 'statement timeout', details: '', hint: '' },
      };
    }
    let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    for (const { col, asc } of [...this.orderBy].reverse()) {
      rows = [...rows].sort((a, b) =>
        String(a[col] ?? '') < String(b[col] ?? '')
          ? asc
            ? -1
            : 1
          : String(a[col] ?? '') > String(b[col] ?? '')
            ? asc
              ? 1
              : -1
            : 0,
      );
    }
    if (this.embed) {
      const embed = this.embed;
      rows = rows.map((r) => ({
        ...r,
        [embed]: (this.db.tables[embed] ?? []).find((x) => x.id === r[`${embed}_id`]) ?? null,
      }));
    }
    if (this.mode === 'many') return { data: rows, error: null };
    if (this.mode === 'single' && rows.length !== 1) {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'not one row', details: '', hint: '' },
      };
    }
    return { data: rows[0] ?? null, error: null };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, fail);
  }
}

export function fakeClient(db: FakeDb, opts: { storageBase?: string } = {}) {
  const base = opts.storageBase ?? 'https://db.example/storage/v1';
  const bucket = {
    async download(path: string, opts?: { transform?: unknown }) {
      if (opts?.transform) return { data: null, error: { message: 'transformations not enabled' } };
      const bytes = db.storage.get(path);
      return bytes
        ? { data: new Blob([bytes]), error: null }
        : { data: null, error: { message: 'Object not found', statusCode: '404' } };
    },
    async upload(path: string, bytes: Uint8Array) {
      if (db.readOnlyStorage) {
        return {
          data: null,
          error: { message: 'new row violates row-level security policy', statusCode: '403' },
        };
      }
      if (db.storage.has(path)) {
        return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      }
      db.storage.set(path, bytes);
      db.uploads.push(path);
      return { data: { path }, error: null };
    },
    async createSignedUrl(path: string, seconds: number) {
      if (!db.storage.has(path)) return { data: null, error: { message: 'Object not found' } };
      return {
        data: {
          signedUrl: `${base}/object/sign/reports/${path}?token=t&exp=${seconds}`,
        },
        error: null,
      };
    },
  };
  return {
    from: (table: string) => new Query(db, table),
    storage: { from: () => bucket },
  };
}
