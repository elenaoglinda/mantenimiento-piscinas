import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LogOut, Receipt, UserCog } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert } from '../components/ui/feedback.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Field, Input } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusPill } from '../components/ui/StatusPill.js';
import { toast } from '../components/ui/toast.js';
import { cn, focusRing } from '../components/ui/utils.js';

/**
 * Ajustes: your own profile, the organisation's name, and shortcuts to the other settings that
 * live with their feature (fiscal data, team). Writes follow the RLS policies: everyone may
 * update their own app_user row; only admins may update the org.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { profile, reloadProfile, signOut } = useAuth();
  const isAdmin = profile?.user.role === 'admin';

  const [fullName, setFullName] = useState('');
  const [dni, setDni] = useState('');
  const [orgName, setOrgName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.user.full_name ?? '');
    setDni(profile.user.dni_nif ?? '');
    setOrgName(profile.org.name);
  }, [profile]);

  if (!profile) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setError(null);
    const { error } = await supabase
      .from('app_user')
      .update({ full_name: fullName.trim() || null, dni_nif: dni.trim() || null })
      .eq('id', profile.user.id);
    setSavingProfile(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    toast(t('settings.saved'));
    void reloadProfile();
  }

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    if (!profile || !orgName.trim()) return;
    setSavingOrg(true);
    setError(null);
    const { error } = await supabase
      .from('org')
      .update({ name: orgName.trim() })
      .eq('id', profile.org.id);
    setSavingOrg(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    toast(t('settings.saved'));
    void reloadProfile();
  }

  const shortcuts = [
    {
      to: '/invoices/settings',
      icon: Receipt,
      title: t('invoicing.fiscalTitle'),
      desc: t('invoicing.fiscalSubtitle'),
    },
    { to: '/team', icon: UserCog, title: t('team.title'), desc: t('settings.teamHint') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title={t('shell.settings')}
        description={t('settings.subtitle')}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('settings.profileTitle')}
            description={profile.user.email ?? undefined}
          />
          <form className="flex flex-col gap-4" onSubmit={saveProfile}>
            <Field label={t('onboarding.yourName')}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label={t('settings.dni')} hint={t('settings.dniHint')}>
              <Input value={dni} onChange={(e) => setDni(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-muted">
                {t('team.columnRole')}:{' '}
                <StatusPill tone="info" dot={false}>
                  {t(`roles.${profile.user.role}`)}
                </StatusPill>
              </span>
              <Button type="submit" loading={savingProfile}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title={t('settings.orgTitle')}
            description={t(`accountType.${profile.org.type}`, { defaultValue: '' }) || undefined}
          />
          <form className="flex flex-col gap-4" onSubmit={saveOrg}>
            <Field
              label={t('settings.orgName')}
              hint={isAdmin ? undefined : t('settings.orgAdminOnly')}
            >
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isAdmin}
                required
              />
            </Field>
            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" loading={savingOrg} disabled={!orgName.trim()}>
                  {t('common.save')}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>

      <Card padded={false}>
        <ul>
          {shortcuts.map(({ to, icon: Icon, title, desc }) => (
            <li key={to} className="border-b border-border last:border-0">
              <Link
                to={to}
                className={cn(
                  'flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted/60 sm:px-6',
                  focusRing,
                )}
              >
                <span
                  aria-hidden
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-text">{title}</span>
                  <span className="block text-sm text-text-muted">{desc}</span>
                </span>
                <ChevronRight aria-hidden size={16} className="text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <Button variant="secondary" onClick={() => void signOut()}>
          <LogOut aria-hidden size={16} />
          {t('auth.signOut')}
        </Button>
      </div>
    </div>
  );
}
