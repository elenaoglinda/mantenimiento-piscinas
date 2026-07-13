import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Alert, Card, Spinner } from '../components/ui/feedback.js';
import type { Tables } from '../lib/database.types.js';

export function TeamPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [members, setMembers] = useState<Tables<'app_user'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('app_user')
        .select('*')
        .order('created_at', { ascending: true });
      if (!active) return;
      if (error) setError(t('common.genericError'));
      else setMembers(data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [t]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t('team.title')}</h1>
        <p className="text-sm text-text-muted">{t('team.subtitle', { org: profile.org.name })}</p>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
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
      )}
    </div>
  );
}
