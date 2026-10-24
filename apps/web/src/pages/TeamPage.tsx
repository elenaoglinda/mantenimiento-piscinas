import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { MailPlus, UserPlus } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { DataTable, type Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Alert } from '../components/ui/feedback.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import type { Tone } from '../components/ui/variants.js';
import { CopyLinkField } from '../components/ui/CopyLinkField.js';
import { InviteMemberModal } from '../components/InviteMemberModal.js';
import { buildInviteUrl } from '../lib/invitations.js';
import type { Tables } from '../lib/database.types.js';

const ROLE_TONE: Record<string, Tone> = { admin: 'info', technician: 'green', viewer: 'neutral' };

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

  const columns: Column<Tables<'app_user'>>[] = [
    {
      id: 'name',
      header: t('team.columnName'),
      cell: (m) => (
        <span className="flex items-center gap-3">
          <Avatar name={m.full_name ?? m.email} size="sm" />
          <span className="flex flex-col">
            <span className="font-medium">
              {m.full_name ?? '—'}
              {m.id === profile.user.id && (
                <span className="ml-2 text-xs font-normal text-text-muted">({t('team.you')})</span>
              )}
            </span>
            <span className="text-xs text-text-muted md:hidden">{m.email ?? '—'}</span>
          </span>
        </span>
      ),
      sortValue: (m) => m.full_name,
    },
    {
      id: 'email',
      header: t('team.columnEmail'),
      cell: (m) => <span className="text-text-muted">{m.email ?? '—'}</span>,
      sortValue: (m) => m.email,
      hideBelow: 'md',
    },
    {
      id: 'role',
      header: t('team.columnRole'),
      cell: (m) => (
        <StatusPill tone={ROLE_TONE[m.role] ?? 'neutral'} dot={false}>
          {t(`roles.${m.role}`)}
        </StatusPill>
      ),
      sortValue: (m) => m.role,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title={t('team.title')}
        description={t('team.subtitle', { org: profile.org.name })}
        actions={
          isAdmin && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden size={16} />
              {t('invitations.invite')}
            </Button>
          )
        }
      />

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <>
          <DataTable
            caption={t('team.title')}
            columns={columns}
            rows={members}
            getRowId={(m) => m.id}
            loading={loading}
            empty={<EmptyState compact title={t('common.none')} />}
          />

          {isAdmin && !loading && (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-text">{t('invitations.pendingTitle')}</h2>
              {invites.length === 0 ? (
                <Card padded={false}>
                  <EmptyState
                    compact
                    icon={<MailPlus size={20} />}
                    title={t('invitations.pendingEmpty')}
                    description={t('invitations.pendingEmptyHint')}
                  />
                </Card>
              ) : (
                invites.map((inv) => (
                  <Card key={inv.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={inv.email} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text">{inv.email}</p>
                          <p className="flex items-center gap-2 text-sm text-text-muted">
                            {t(`roles.${inv.role}`)}
                            <StatusPill tone="amber">{t('invitations.pending')}</StatusPill>
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" onClick={() => void revoke(inv.id)}>
                        {t('invitations.revoke')}
                      </Button>
                    </div>
                    <CopyLinkField url={buildInviteUrl(inv.token)} />
                  </Card>
                ))
              )}
            </section>
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
