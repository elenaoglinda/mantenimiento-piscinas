import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import { clearPendingInvite, storePendingInvite } from '../lib/invitations.js';
import type { Enums } from '../lib/database.types.js';

interface InviteInfo {
  orgName: string;
  role: Enums<'user_role'>;
  email: string;
  status: Enums<'invitation_status'>;
  expired: boolean;
}

/**
 * Public accept screen for a share-link invitation. Handles every auth state:
 * signed-out (prompt to sign up/in with the invited email), signed-in-but-not-onboarded
 * (accept → join the org), and already-provisioned (nothing to do).
 */
export function InvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { session, profile, loading: authLoading, reloadProfile } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist the token so it survives the sign-up / email-confirmation round-trip.
  useEffect(() => {
    if (token) storePendingInvite(token);
  }, [token]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.rpc('get_invitation', { p_token: token });
      if (!active) return;
      const row = data?.[0];
      if (error || !row) {
        setInfo(null);
      } else {
        setInfo({
          orgName: row.org_name,
          role: row.role,
          email: row.email,
          status: row.status,
          expired: row.expired,
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function onAccept(e: FormEvent) {
    e.preventDefault();
    setAccepting(true);
    setError(null);
    const { error } = await supabase.rpc('accept_invitation', {
      p_token: token,
      p_full_name: fullName.trim(),
    });
    if (error) {
      setAccepting(false);
      const msg = error.message.toLowerCase();
      if (msg.includes('email')) setError(t('invitations.emailMismatch'));
      else if (msg.includes('expired')) setError(t('invitations.expired'));
      else if (msg.includes('available')) setError(t('invitations.notAvailable'));
      else if (msg.includes('provisioned')) setError(t('invitations.alreadyMember'));
      else setError(t('common.genericError'));
      return;
    }
    clearPendingInvite();
    await reloadProfile();
    navigate('/', { replace: true });
  }

  if (authLoading || loading) {
    return (
      <AuthLayout>
        <Card>
          <Spinner label={t('common.loading')} />
        </Card>
      </AuthLayout>
    );
  }

  // Invalid / consumed / expired invitations all resolve to a dead end with a clear reason.
  const invalidReason =
    !info || info.status === 'revoked'
      ? t('invitations.invalid')
      : info.status === 'accepted'
        ? t('invitations.alreadyAccepted')
        : info.expired
          ? t('invitations.expired')
          : null;

  if (invalidReason) {
    return (
      <AuthLayout>
        <Card>
          <h1 className="text-xl font-semibold text-text">{t('invitations.acceptTitle')}</h1>
          <Alert tone="error">{invalidReason}</Alert>
          <p className="mt-4 text-center text-sm text-text-muted">
            <Link to="/" className="font-medium text-accent hover:underline">
              {t('invitations.goHome')}
            </Link>
          </p>
        </Card>
      </AuthLayout>
    );
  }

  // Already part of an org — one user maps to one org, so they can't accept another.
  if (profile) {
    return (
      <AuthLayout>
        <Card>
          <h1 className="text-xl font-semibold text-text">{t('invitations.acceptTitle')}</h1>
          <p className="mt-2 text-sm text-text-muted">{t('invitations.alreadyMember')}</p>
          <p className="mt-4 text-center text-sm text-text-muted">
            <Link to="/" className="font-medium text-accent hover:underline">
              {t('invitations.goHome')}
            </Link>
          </p>
        </Card>
      </AuthLayout>
    );
  }

  const summary = t('invitations.summary', {
    org: info!.orgName,
    role: t(`roles.${info!.role}`),
  });

  // Signed out: send them to sign up / in with the invited email; the token is stored.
  if (!session) {
    return (
      <AuthLayout>
        <Card>
          <h1 className="text-xl font-semibold text-text">{t('invitations.acceptTitle')}</h1>
          <p className="mt-2 text-sm text-text-muted">{summary}</p>
          <p className="mt-1 text-sm text-text-muted">
            {t('invitations.useEmail', { email: info!.email })}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link to="/signup">
              <Button className="w-full">{t('invitations.createAccount')}</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" className="w-full">
                {t('invitations.signIn')}
              </Button>
            </Link>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  // Signed in, not yet onboarded: accept and join the org.
  return (
    <AuthLayout>
      <Card>
        <h1 className="text-xl font-semibold text-text">{t('invitations.acceptTitle')}</h1>
        <p className="mt-2 mb-5 text-sm text-text-muted">{summary}</p>
        <form className="flex flex-col gap-4" onSubmit={onAccept}>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label={t('invitations.yourName')}
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Button type="submit" loading={accepting}>
            {accepting ? t('invitations.joining') : t('invitations.joinButton')}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
