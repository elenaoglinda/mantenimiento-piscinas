import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button.js';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Alert } from '../../../components/ui/feedback.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { LOGO_TYPES, fetchLogoUrl, removeLogo, saveLogo, type LogoError } from '../lib/logo.js';

/** Ajustes (admins): the logo printed at the top of the PDFs sent to clients. */
export function LogoSettings({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LogoError | 'load' | null>(null);

  const load = useCallback(async () => {
    const res = await fetchLogoUrl(orgId);
    setUrl(res.url);
    if (res.failed) setError('load');
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const err = await saveLogo(orgId, file);
    if (err) setError(err);
    await load();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const err = await removeLogo(orgId);
    if (err) setError(err);
    await load();
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader
        title={t('clientReports.logo.title')}
        description={t('clientReports.logo.hint')}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-muted">
          {loading ? (
            <Skeleton className="h-10 w-28" />
          ) : url ? (
            <img src={url} alt={t('clientReports.logo.current')} className="max-h-14 max-w-36" />
          ) : (
            <span className="text-xs text-text-muted">{t('clientReports.logo.none')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            <ImageUp aria-hidden size={16} />
            {url ? t('clientReports.logo.replace') : t('clientReports.logo.upload')}
          </Button>
          {url && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
              <Trash2 aria-hidden size={16} />
              {t('clientReports.logo.remove')}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="hidden"
          aria-label={t('clientReports.logo.upload')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      {error && (
        <Alert tone="error" className="mt-3">
          {t(`clientReports.logo.errors.${error}`)}
        </Alert>
      )}
    </Card>
  );
}
