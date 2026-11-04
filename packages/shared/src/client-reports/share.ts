/**
 * The small part of client reports the web app needs: the e-mail and WhatsApp links that carry
 * a PDF's signed link, and the months a summary can be asked for. No PDF code, so the main
 * package barrel can export it without pulling pdf-lib into the browser bundle.
 */

export const SIGNED_LINK_DAYS = 30;
export const SIGNED_LINK_SECONDS = SIGNED_LINK_DAYS * 24 * 60 * 60;

/** E-mail link to the client, subject and body URL-encoded (spaces as %20, never "+"). */
export function mailtoLink(to: string | null | undefined, subject: string, body: string): string {
  const addr = (to ?? '').trim();
  // A comma would add a second recipient; anything odd and we leave "to" empty for the user.
  const safeTo = /^[^\s,;<>"]+@[^\s,;<>"]+$/.test(addr) ? addr : '';
  return `mailto:${encodeURIComponent(safeTo).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Spanish phone number in WhatsApp's form (country code, digits only), or null. Nine-digit
 * Spanish numbers get 34; numbers with a + or 00 prefix keep theirs.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length === 9 && /^[6789]/.test(digits)) {
    digits = `34${digits}`;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** wa.me link with the message; without a valid number WhatsApp asks whom to send it to. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const n = whatsappNumber(phone);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`;
}

export { isMonth, monthLabelEs, recentMonths } from './format.js';
