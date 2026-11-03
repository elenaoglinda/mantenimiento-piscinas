import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Relative imports, not `@piscinas/shared`: see scripts/check-api.cjs for why.
import {
  SIGNED_LINK_SECONDS,
  flattenLabels,
  isMonth,
  layoutMonthlySummary,
  layoutVisitReport,
  monthlyTitle,
  renderPdf,
  visitTitle,
  type PdfLabels,
} from '../packages/shared/src/client-reports/index.js';
import es from '../apps/web/src/locales/es/common.json' with { type: 'json' };
import { callerClient } from './_lib/caller.js';
import {
  LoadError,
  loadMonthlySummary,
  loadVisitReport,
  type Loaded,
} from './_lib/reportPdfData.js';

/**
 * Client PDFs. POST /api/report-pdf, with the caller's Supabase access token as Bearer.
 *   { kind: 'visit', reportId }            → the visit report (completed or signed visits only)
 *   { kind: 'monthly', poolId, month }      → the monthly summary of a pool ('YYYY-MM')
 * → 200 { url, fileName, expiresAt, pages, warnings }
 *
 * Reads client data, so it requires a live session and queries WITH THE CALLER'S TOKEN: RLS
 * decides what they can see, exactly as in the app. No service-role key anywhere.
 *
 * The PDF is stored in the private `reports` bucket under the caller's org, named after the
 * hash of its bytes (the bytes are deterministic). Same content → same file: a second request
 * reuses it and earlier links keep working. `url` is a signed link valid for 30 days — what
 * the e-mail and WhatsApp buttons send to the pool's client.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS: PdfLabels = flattenLabels(
  (es as unknown as { clientReports: { pdf: unknown } }).clientReports.pdf,
);

type Body =
  | { kind: 'visit'; reportId: string }
  | { kind: 'monthly'; poolId: string; month: string };

export function parseBody(raw: unknown): Body | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.kind === 'visit' && typeof b.reportId === 'string' && UUID.test(b.reportId)) {
    return { kind: 'visit', reportId: b.reportId };
  }
  if (
    b.kind === 'monthly' &&
    typeof b.poolId === 'string' &&
    UUID.test(b.poolId) &&
    isMonth(b.month)
  ) {
    return { kind: 'monthly', poolId: b.poolId, month: b.month };
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const caller = await callerClient(req);
  if (caller === 'not_configured') {
    res.status(503).json({ error: 'not_configured' });
    return;
  }
  if (!caller) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const body = parseBody(req.body);
  if (!body) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  const { client } = caller;

  try {
    let loaded: Loaded<unknown>;
    let title: string;
    let rendered: Awaited<ReturnType<typeof renderPdf>>;
    if (body.kind === 'visit') {
      const visit = await loadVisitReport(client, body.reportId);
      loaded = visit;
      title = visitTitle(visit.data, LABELS);
      rendered = await renderPdf({
        title,
        images: visit.images,
        layout: ({ measure, imageSize }) =>
          layoutVisitReport(visit.data, LABELS, measure, imageSize),
      });
    } else {
      const monthly = await loadMonthlySummary(client, body.poolId, body.month);
      loaded = monthly;
      title = `${monthlyTitle(body.month, LABELS)} · ${monthly.data.poolName}`;
      rendered = await renderPdf({
        title,
        images: monthly.images,
        layout: ({ measure, imageSize }) =>
          layoutMonthlySummary(monthly.data, LABELS, measure, imageSize),
      });
    }
    const warnings = [...loaded.warnings];
    if (rendered.failedImages.some((r) => r.startsWith('photo:'))) warnings.push('photos_left_out');
    if (rendered.failedImages.includes('logo')) warnings.push('logo_unreadable');
    if (rendered.failedImages.includes('signature')) warnings.push('signature_unreadable');

    const hash = createHash('sha256').update(rendered.bytes).digest('hex').slice(0, 16);
    const path = `${loaded.pathPrefix}/${hash}.pdf`;
    const bucket = client.storage.from('reports');

    // Already stored (same content)? Then just sign it — this also lets a viewer, who may not
    // write to storage, share a PDF someone else generated.
    let signed = await bucket.createSignedUrl(path, SIGNED_LINK_SECONDS);
    if (signed.error || !signed.data) {
      const up = await bucket.upload(path, rendered.bytes, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });
      if (up.error) {
        const status = Number((up.error as { statusCode?: string | number }).statusCode);
        const exists = status === 409 || /exist|duplicate/i.test(up.error.message);
        if (!exists) {
          const forbidden =
            status === 403 || /row-level security|unauthori[sz]ed/i.test(up.error.message);
          console.error('report-pdf upload failed', status, up.error.message);
          res
            .status(forbidden ? 403 : 502)
            .json({ error: forbidden ? 'cannot_store' : 'storage_failed' });
          return;
        }
      }
      signed = await bucket.createSignedUrl(path, SIGNED_LINK_SECONDS);
      if (signed.error || !signed.data) {
        console.error('report-pdf sign failed', signed.error?.message);
        res.status(502).json({ error: 'storage_failed' });
        return;
      }
    }

    res.status(200).json({
      url: signed.data.signedUrl,
      fileName: loaded.fileName,
      expiresAt: new Date(Date.now() + SIGNED_LINK_SECONDS * 1000).toISOString(),
      pages: rendered.pages,
      warnings: [...new Set(warnings)],
    });
  } catch (err) {
    if (err instanceof LoadError) {
      if (err.code === 'not_found') res.status(404).json({ error: 'not_found' });
      else if (err.code === 'not_ready') res.status(409).json({ error: 'not_ready' });
      else {
        console.error('report-pdf data failed', err.message);
        res.status(502).json({ error: 'data_failed' });
      }
      return;
    }
    console.error('report-pdf failed', err);
    res.status(500).json({ error: 'pdf_failed' });
  }
}
