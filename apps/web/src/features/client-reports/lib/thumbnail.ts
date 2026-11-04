import { supabase } from '../../../lib/supabase.js';

/** Where a photo's PDF thumbnail lives: next to it, so the PDF API finds it without a lookup. */
export function thumbnailPath(photoPath: string): string {
  return `${photoPath}.thumb.jpg`;
}

/** A JPEG no larger than `max` pixels on its long edge, or null if the browser can't decode it. */
export async function makeThumbnail(file: Blob, max = 640): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  } catch {
    return null;
  }
}

/**
 * Saves a small copy of a just-uploaded photo for the client PDFs (a phone photo is several MB;
 * the PDF must open on a phone). Returns false if it couldn't: the photo itself is saved either
 * way, and the PDF then says which photos it left out, so nothing is lost silently.
 */
export async function savePhotoThumbnail(photoPath: string, file: Blob): Promise<boolean> {
  const thumb = await makeThumbnail(file);
  if (!thumb) return false;
  const { error } = await supabase.storage
    .from('reports')
    .upload(thumbnailPath(photoPath), thumb, { contentType: 'image/jpeg' });
  return !error;
}
