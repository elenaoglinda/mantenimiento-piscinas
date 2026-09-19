import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EXTRACTION_USER_PROMPT, buildExtractionSystemPrompt } from '@piscinas/shared';

/**
 * Claude vision proxy for photo import. POST /api/extract-reading
 * Body: { image: <base64, no data: prefix>, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
 * → 200 { text } — the model's raw reply, validated client-side by parseExtraction().
 *
 * Keeps ANTHROPIC_API_KEY server-side, exactly like the Mapbox proxies keep MAPBOX_TOKEN.
 * Two things this endpoint deliberately does NOT do:
 *   - accept a caller-supplied prompt (that would make it a free general-purpose LLM proxy), and
 *   - write anything to the database (the client saves through RLS as the signed-in user).
 * It only spends money, so unlike the Mapbox proxies it requires a valid Supabase session.
 */

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** ~4MB decoded. Vercel caps request bodies around 4.5MB; the client downscales before sending. */
const MAX_BASE64_LEN = 5_600_000;
const MODEL = 'claude-sonnet-5';

interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>;
}

/** Verify the caller's Supabase access token. Returns true only for a live session. */
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await isAuthenticated(req))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'extraction_unavailable' });
    return;
  }

  const body = (req.body ?? {}) as { image?: unknown; mediaType?: unknown };
  const image = typeof body.image === 'string' ? body.image : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';

  if (!image || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: 'invalid_image' });
    return;
  }
  if (image.length > MAX_BASE64_LEN) {
    res.status(413).json({ error: 'image_too_large' });
    return;
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildExtractionSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: EXTRACTION_USER_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      // Body may carry the API's error detail; keep it in the server log only.
      console.error('Anthropic request failed', resp.status, await resp.text().catch(() => ''));
      res.status(502).json({ error: 'extraction_failed' });
      return;
    }

    const data = (await resp.json()) as AnthropicMessage;
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!text) {
      res.status(502).json({ error: 'extraction_failed' });
      return;
    }

    res.status(200).json({ text, model: MODEL });
  } catch (err) {
    console.error('extract-reading failed', err);
    res.status(502).json({ error: 'extraction_failed' });
  }
}
