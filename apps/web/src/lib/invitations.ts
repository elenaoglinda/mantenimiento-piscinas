/**
 * Helpers for the share-link team-invitation flow (Feature 1).
 *
 * An admin creates an `invitation` row with an opaque token; the invitee opens
 * `/invite/:token`, authenticates with the invited email, and calls `accept_invitation`.
 * The token is persisted to localStorage so it survives the sign-up / email-confirmation
 * round-trip (both LoginPage and SignupPage land on `/`, not back on the invite URL).
 */

const PENDING_INVITE_KEY = 'pendingInviteToken';

/** Opaque bearer token for an invitation (~244 bits of entropy from two UUIDs). */
export function newInviteToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

/** Absolute, shareable accept URL for a token. */
export function buildInviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function storePendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Private-mode / storage-disabled: the invite still works via the link itself.
  }
}

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
}
