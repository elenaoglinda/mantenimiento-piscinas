import { supabase } from '../../../lib/supabase.js';

/** The org's logo for the client PDFs. A fixed path: no table, no migration. */
export function logoPath(orgId: string): string {
  return `${orgId}/branding/logo`;
}

export const LOGO_MAX_BYTES = 1_000_000;
export const LOGO_TYPES = ['image/png', 'image/jpeg'];

export type LogoError = 'too_large' | 'wrong_type' | 'failed';

/** Signed URL of the current logo, or null when there is none. */
export async function fetchLogoUrl(
  orgId: string,
): Promise<{ url: string | null; failed: boolean }> {
  const { data, error } = await supabase.storage
    .from('reports')
    .createSignedUrl(logoPath(orgId), 600);
  if (error) {
    // No logo yet is the normal case, not a failure.
    return { url: null, failed: !/not.?found/i.test(error.message) };
  }
  return { url: data.signedUrl, failed: false };
}

/**
 * Replaces the logo. Storage has no update policy on this bucket (files are write-once), so
 * replacing is delete + upload.
 */
export async function saveLogo(orgId: string, file: File): Promise<LogoError | null> {
  if (!LOGO_TYPES.includes(file.type)) return 'wrong_type';
  if (file.size > LOGO_MAX_BYTES) return 'too_large';
  const bucket = supabase.storage.from('reports');
  const removed = await bucket.remove([logoPath(orgId)]);
  if (removed.error) return 'failed';
  const { error } = await bucket.upload(logoPath(orgId), file, { contentType: file.type });
  return error ? 'failed' : null;
}

export async function removeLogo(orgId: string): Promise<LogoError | null> {
  const { error } = await supabase.storage.from('reports').remove([logoPath(orgId)]);
  return error ? 'failed' : null;
}
