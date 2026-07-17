import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Button } from '../components/ui/Button.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { CopyLinkField } from '../components/ui/CopyLinkField.js';
import { InviteMemberModal } from '../components/InviteMemberModal.js';
import { buildInviteUrl } from '../lib/invitations.js';
import type { Tables } from '../lib/database.types.js';

export function TeamPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isAdmin = profile?.user.role === 'admin';

  const [members, setMembers] = useState<Tables<'app_user'>[]>([]);
  const [invites, setInvites] = useState<Tables<'invitation'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const membersQuery = supabase
      .from('app_user')
      .select('*')
      .order('created_at', { ascending: true });
    // Only admins can read the invitation table (RLS); skip the query otherwise.
    const invitesQuery = isAdmin
      ? supabase
          .from('invitation')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Tables<'invitation'>[], error: null });

    const [{ data: memberData, error: memberError }, { data: inviteData }] = await Promise.all([
      membersQuery,
      invitesQuery,
    ]);
    if (memberError) setError(t('common.genericError'));
    else setMembers(memberData ?? []);
    setInvites(inviteData ?? []);
    setLoading(false);
  }, [isAdmin, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    setInvites((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from('invitation').update({ status: 'revoked' }).eq('id', id);
    if (error) {
      setError(t('common.genericError'));
      void load();
    }
  }

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">{t('team.title')}</h1>
          <p className="text-sm text-text-muted">{t('team.subtitle', { org: profile.org.name })}</p>
        </div>
        {isAdmin && <Button onClick={() => setInviteOpen(true)}>{t('invitations.invite')}</Button>}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('team.columnName')}</th>
                  <th className="px-4 py-3 font-medium">{t('team.columnEmail')}</th>
                  <th className="px-4 py-3 font-medium">{t('team.columnRole')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text">
                      {m.full_name ?? '—'}
                      {m.id === profile.user.id && (
                        <span className="ml-2 text-xs text-text-muted">({t('team.you')})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{m.email ?? '—'}</td>
                    <td className="px-4 py-3 text-text">{t(`roles.${m.role}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {isAdmin && invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-text">{t('invitations.pendingTitle')}</h2>
              {invites.map((inv) => (
                <Card key={inv.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">{inv.email}</p>
                      <p className="text-sm text-text-muted">{t(`roles.${inv.role}`)}</p>
                    </div>
                    <Button variant="ghost" onClick={() => void revoke(inv.id)}>
                      {t('invitations.revoke')}
                    </Button>
                  </div>
                  <CopyLinkField url={buildInviteUrl(inv.token)} />
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
