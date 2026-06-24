import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/feedback.js';

export function DashboardPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [poolCount, setPoolCount] = useState<number | null>(null);

  const isCompany = profile?.org.type === 'company';
  const canWrite = profile ? profile.user.role !== 'viewer' : false;

  useEffect(() => {
    void (async () => {
      const [{ count: clients }, { count: pools }] = await Promise.all([
        supabase.from('client').select('id', { count: 'exact', head: true }).eq('archived', false),
        supabase.from('pool').select('id', { count: 'exact', head: true }).eq('archived', false),
      ]);
      setClientCount(clients ?? 0);
      setPoolCount(pools ?? 0);
    })();
  }, []);

  if (!profile) return null;

  // Companies need a client before a pool; owners already have an implicit self-client.
  const needsClient = isCompany && clientCount === 0;
  const needsPool = !needsClient && poolCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {t('dashboard.welcome', { name: profile.user.full_name ?? '' })}
      </h1>

      {canWrite && (needsClient || needsPool) && (
        <Card>
          <h2 className="text-lg font-semibold text-text">{t('dashboard.gettingStarted')}</h2>
          {needsClient ? (
            <>
              <p className="mt-1 mb-4 text-text-muted">{t('dashboard.addFirstClientHint')}</p>
              <Link to="/clients">
                <Button>{t('dashboard.addFirstClient')}</Button>
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 mb-4 text-text-muted">{t('dashboard.addFirstPoolHint')}</p>
              <Link to="/pools">
                <Button>{t('dashboard.addFirstPool')}</Button>
              </Link>
            </>
          )}
        </Card>
      )}

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
    </div>
  );
}
