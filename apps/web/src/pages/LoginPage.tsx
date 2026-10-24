import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { Alert, Card } from '../components/ui/feedback.js';
import { GoogleButton } from '../components/ui/GoogleButton.js';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(t('auth.invalidCredentials'));
      return;
    }
    navigate('/', { replace: true });
  }

  async function onMagicLink() {
    if (!email) {
      setError(t('common.requiredField'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    setInfo(t('auth.magicLinkSent'));
  }

  async function onGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(t('auth.googleNotConfigured'));
  }

  return (
    <AuthLayout>
      <Card>
        <h1 className="mb-5 text-xl font-semibold text-text">{t('auth.signInTitle')}</h1>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          {error && <Alert tone="error">{error}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <TextField
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" loading={loading}>
            {t('auth.signInButton')}
          </Button>
        </form>

        <button
          type="button"
          onClick={onMagicLink}
          disabled={loading}
          className="mt-3 w-full text-center text-sm font-medium text-accent hover:underline disabled:opacity-60"
        >
          {t('auth.magicLink')}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
          <span className="h-px flex-1 bg-border" />
          {t('auth.orContinueWith')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton onClick={onGoogle} disabled={loading} />

        <p className="mt-6 text-center text-sm text-text-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            {t('auth.createOne')}
          </Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
