import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { Alert, Card } from '../components/ui/feedback.js';
import { GoogleButton } from '../components/ui/GoogleButton.js';

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t('auth.passwordHint'));
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    // When email confirmation is required there is no active session yet.
    if (data.session) {
      navigate('/onboarding', { replace: true });
    } else {
      setInfo(t('auth.verifyEmailSent'));
    }
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
        <h1 className="mb-5 text-xl font-semibold text-text">{t('auth.signUpTitle')}</h1>
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
            autoComplete="new-password"
            required
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" loading={loading}>
            {t('auth.signUpButton')}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
          <span className="h-px flex-1 bg-border" />
          {t('auth.orContinueWith')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton onClick={onGoogle} disabled={loading} />

        <p className="mt-6 text-center text-sm text-text-muted">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t('auth.signInLink')}
          </Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
