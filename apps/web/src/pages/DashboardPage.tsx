import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { Card } from '../components/ui/feedback.js';

export function DashboardPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {t('dashboard.welcome', { name: profile.user.full_name ?? '' })}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-text-muted">{t('dashboard.orgLabel')}</p>
          <p className="mt-1 text-lg font-medium text-text">{profile.org.name}</p>
          <p className="text-sm text-text-muted">{t(`accountType.${profile.org.type}`)}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">{t('dashboard.roleLabel')}</p>
          <p className="mt-1 text-lg font-medium text-text">{t(`roles.${profile.user.role}`)}</p>
        </Card>
      </div>

      <Card>
        <p className="text-text-muted">{t('dashboard.phase1Note')}</p>
      </Card>
    </div>
  );
}
