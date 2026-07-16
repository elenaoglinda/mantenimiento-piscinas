import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildInviteUrl,
  clearPendingInvite,
  newInviteToken,
  readPendingInvite,
  storePendingInvite,
} from './invitations.js';

describe('invitations helpers', () => {
  beforeEach(() => localStorage.clear());

  it('generates opaque, unique, dash-free tokens', () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toContain('-');
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toEqual(b);
  });

  it('builds an absolute accept URL from the current origin', () => {
    expect(buildInviteUrl('abc123')).toBe(`${window.location.origin}/invite/abc123`);
  });

  it('round-trips the pending invite token through localStorage', () => {
    expect(readPendingInvite()).toBeNull();
    storePendingInvite('tok-1');
    expect(readPendingInvite()).toBe('tok-1');
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });
});
