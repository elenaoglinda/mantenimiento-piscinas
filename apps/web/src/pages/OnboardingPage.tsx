import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/ui/Button.js';
import { TextField } from '../components/ui/TextField.js';
import { Alert, Card } from '../components/ui/feedback.js';
import { readPendingInvite } from '../lib/invitations.js';
import type { Enums } from '../lib/database.types.js';

type AccountType = Enums<'org_type'>;

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, reloadProfile } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('owner');
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already provisioned → nothing to do here.
  if (profile) return <Navigate to="/" replace />;

  // Arrived here via an invitation link → accept it instead of creating a new org.
  const pendingInvite = readPendingInvite();
  if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc('provision_account', {
      p_account_type: accountType,
      p_org_name: orgName.trim(),
      p_full_name: fullName.trim(),
    });
    if (error) {
      setLoading(false);
      setError(t('common.genericError'));
      return;
    }
    await reloadProfile();
    navigate('/', { replace: true });
  }

  const options: Array<{ value: AccountType; label: string; desc: string }> = [
    { value: 'owner', label: t('onboarding.owner'), desc: t('onboarding.ownerDesc') },
    { value: 'company', label: t('onboarding.company'), desc: t('onboarding.companyDesc') },
  ];

  return (
    <AuthLayout>
      <Card>
        <h1 className="text-xl font-semibold text-text">{t('onboarding.title')}</h1>
        <p className="mt-1 mb-5 text-sm text-text-muted">{t('onboarding.subtitle')}</p>

        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          {error && <Alert tone="error">{error}</Alert>}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium text-text">
              {t('onboarding.accountTypeQuestion')}
            </legend>
            {options.map((opt) => {
              const selected = accountType === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-md)] border p-4 transition-colors ${
                    selected
                      ? 'border-accent bg-accent-soft ring-1 ring-accent'
                      : 'border-border hover:bg-surface-muted'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="accountType"
                      className="accent-primary"
                      checked={selected}
                      onChange={() => setAccountType(opt.value)}
                    />
                    <span className="font-medium text-text">{opt.label}</span>
                  </span>
                  <span className="pl-6 text-sm text-text-muted">{opt.desc}</span>
                </label>
              );
            })}
          </fieldset>

          <TextField
            label={t('onboarding.orgName')}
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            hint={
              accountType === 'owner'
                ? t('onboarding.orgNameOwnerHint')
                : t('onboarding.orgNameCompanyHint')
            }
          />
          <TextField
            label={t('onboarding.yourName')}
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <Button type="submit" loading={loading}>
            {loading ? t('onboarding.creating') : t('onboarding.submit')}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
