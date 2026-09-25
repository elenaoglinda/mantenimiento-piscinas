import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CreateInvoicePayload } from '@piscinas/shared';

/**
 * Veri*Factu proxy. POST /api/verifacti
 *   { action: 'create', idempotencyKey: <uuid>, payload: <CreateInvoicePayload> }
 *   { action: 'status', serie, numero, fechaExpedicion }
 *   { action: 'health' }
 *
 * Keeps VERIFACTI_API_KEY server-side, exactly like ANTHROPIC_API_KEY and MAPBOX_TOKEN.
 *
 * Three deliberate properties:
 *   - It requires a valid Supabase session. Every create is a *legal record* at AEAT and costs
 *     money; this must never be an open relay.
 *   - It writes nothing to our database. The client persists the result through RLS as the
 *     signed-in user, so an invoice can only ever be updated by someone entitled to see it.
 *   - It forwards the caller's Idempotency-Key unchanged. Verifacti answers 409 if the same key
 *     is in flight and 422 if it is reused with a different payload, which is what makes a
 *     retry safe: a repeated send can never create a second record at AEAT.
 *
 * NOTE (single-tenant, on purpose): this reads ONE key from the environment, so every org
 * currently invoices through the same Veri*Factu account. Verifacti issues one API key per
 * obligado tributario, so real multi-tenant use needs a per-org credential. That is the next
 * PR; until then this is a test-environment integration only. See docs/INVOICING.md.
 */

const BASE_URL = 'https://api.verifacti.com';
/** Verifacti forwards to AEAT asynchronously; their own docs cite up to 200s. */
const UPSTREAM_TIMEOUT_MS = 60_000;

type Action = 'create' | 'status' | 'health';

async function isAuthenticated(req: VercelRequest): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return false;

  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return false;

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: auth },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Shape-check the payload. The authoritative validation is validateForSending() client-side. */
function looksLikePayload(value: unknown): value is CreateInvoicePayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.serie === 'string' &&
    typeof p.numero === 'string' &&
    typeof p.fecha_expedicion === 'string' &&
    typeof p.tipo_factura === 'string' &&
    typeof p.descripcion === 'string' &&
    Array.isArray(p.lineas) &&
    p.lineas.length > 0 &&
    typeof p.importe_total === 'string'
  );
}

async function callUpstream(
  path: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await resp.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { mensaje: text.slice(0, 500) };
    }
    return { status: resp.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await isAuthenticated(req))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const apiKey = process.env.VERIFACTI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'verifacti_unavailable' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = body.action as Action;

  try {
    if (action === 'health') {
      const r = await callUpstream('/verifactu/health', 'GET', apiKey);
      res.status(r.status === 200 ? 200 : 502).json(r.body);
      return;
    }

    if (action === 'create') {
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
      if (!idempotencyKey) {
        // Without it a retry could duplicate a legal record; refuse rather than risk it.
        res.status(400).json({ error: 'missing_idempotency_key' });
        return;
      }
      if (!looksLikePayload(body.payload)) {
        res.status(400).json({ error: 'invalid_payload' });
        return;
      }
      const r = await callUpstream(
        '/verifactu/create',
        'POST',
        apiKey,
        body.payload,
        idempotencyKey,
      );
      // 409/422 are idempotency answers, not failures — pass them through untouched so the
      // client can reconcile instead of re-sending.
      res.status(r.status).json(r.body);
      return;
    }

    if (action === 'status') {
      const serie = typeof body.serie === 'string' ? body.serie : null;
      const numero = typeof body.numero === 'string' ? body.numero : null;
      const fecha = typeof body.fechaExpedicion === 'string' ? body.fechaExpedicion : null;
      if (!numero || !fecha) {
        res.status(400).json({ error: 'invalid_status_query' });
        return;
      }
      const r = await callUpstream('/verifactu/status', 'POST', apiKey, {
        serie: serie ?? '',
        numero,
        fecha_expedicion: fecha,
      });
      res.status(r.status).json(r.body);
      return;
    }

    res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    // A timeout or network error here means we do NOT know whether the record reached AEAT.
    // The client must retry under the same Idempotency-Key, never with a fresh one.
    const aborted = err instanceof Error && err.name === 'AbortError';
    res.status(504).json({ error: aborted ? 'upstream_timeout' : 'upstream_error' });
  }
}
