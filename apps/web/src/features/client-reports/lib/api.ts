import { supabase } from '../../../lib/supabase.js';

/** What /api/report-pdf builds: one visit, or one pool's month. */
export type PdfRequest =
  | { kind: 'visit'; reportId: string }
  | { kind: 'monthly'; poolId: string; month: string };

export interface PdfLink {
  /** Signed link to the stored PDF, valid for 30 days. */
  url: string;
  fileName: string;
  expiresAt: string;
  pages: number;
  /** Things left out of the PDF, e.g. 'photos_left_out' (see clientReports.warnings). */
  warnings: string[];
}

/** Every way the request can fail; each has a message in clientReports.errors. */
export type PdfErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'not_found'
  | 'not_ready'
  | 'cannot_store'
  | 'storage_failed'
  | 'data_failed'
  | 'not_configured'
  | 'pdf_failed'
  | 'network';

const KNOWN: readonly PdfErrorCode[] = [
  'unauthorized',
  'invalid_request',
  'not_found',
  'not_ready',
  'cannot_store',
  'storage_failed',
  'data_failed',
  'not_configured',
  'pdf_failed',
];

export type PdfResult = { link: PdfLink; error: null } | { link: null; error: PdfErrorCode };

/**
 * Asks the server for the PDF with the signed-in user's token; the server reads the data as
 * that user (RLS), stores the PDF and returns a signed link. Never throws: every failure comes
 * back as a code the UI explains.
 */
export async function requestPdf(body: PdfRequest): Promise<PdfResult> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) return { link: null, error: 'unauthorized' };
  try {
    const resp = await fetch('/api/report-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await resp.json().catch(() => null)) as
      | (Partial<PdfLink> & { error?: string })
      | null;
    if (resp.ok && json && typeof json.url === 'string') {
      return {
        error: null,
        link: {
          url: json.url,
          fileName: json.fileName ?? 'informe.pdf',
          expiresAt: json.expiresAt ?? '',
          pages: json.pages ?? 0,
          warnings: Array.isArray(json.warnings) ? json.warnings : [],
        },
      };
    }
    const code = json?.error as PdfErrorCode | undefined;
    return { link: null, error: code && KNOWN.includes(code) ? code : 'network' };
  } catch {
    // Offline, or `npm run dev` without `vercel dev` (no /api locally).
    return { link: null, error: 'network' };
  }
}

/** The same signed link, but answered as a download with a readable file name. */
export function downloadUrl(link: PdfLink): string {
  const sep = link.url.includes('?') ? '&' : '?';
  return `${link.url}${sep}download=${encodeURIComponent(link.fileName)}`;
}
