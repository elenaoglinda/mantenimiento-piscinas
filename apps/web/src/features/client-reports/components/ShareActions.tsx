import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Mail, MessageCircle } from 'lucide-react';
import { mailtoLink, whatsappLink } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Alert } from '../../../components/ui/feedback.js';
import {
  downloadUrl,
  requestPdf,
  type PdfErrorCode,
  type PdfLink,
  type PdfRequest,
} from '../lib/api.js';
import type { ClientContact } from '../lib/data.js';

export interface ShareMessages {
  subject: string;
  body: string;
  whatsapp: string;
}

type Action = 'download' | 'email' | 'whatsapp';

const expiryFmt = /* @__PURE__ */ new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * "Descargar PDF", "Enviar por email", "Enviar por WhatsApp" for one PDF. The first click asks
 * the server to build and store the PDF; all three then use the same 30-day signed link.
 *
 * WhatsApp opens in a new tab. Browsers only allow that in direct response to a click, and the
 * link only exists after the server answers, so the tab is opened (blank) on the click and
 * pointed at wa.me once the link arrives. If anything is blocked, the panel that appears after
 * the first success has plain links to open the PDF, the e-mail and WhatsApp by hand.
 */
export function ShareActions({
  request,
  contact,
  messages,
}: {
  request: PdfRequest;
  contact: ClientContact | null;
  messages: (link: PdfLink, expires: string) => ShareMessages;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Action | null>(null);
  const [link, setLink] = useState<PdfLink | null>(null);
  const [error, setError] = useState<PdfErrorCode | null>(null);
  const [copied, setCopied] = useState(false);
  const key = JSON.stringify(request);
  const linkKey = useRef<string | null>(null);

  // A different visit or month needs a different PDF.
  useEffect(() => {
    if (linkKey.current !== key) {
      setLink(null);
      setError(null);
    }
  }, [key]);

  const expires = link?.expiresAt ? expiryFmt.format(new Date(link.expiresAt)) : '';
  const msgs = link ? messages(link, expires) : null;
  const mailHref = msgs ? mailtoLink(contact?.email, msgs.subject, msgs.body) : null;
  const waHref = msgs ? whatsappLink(contact?.phone, msgs.whatsapp) : null;

  async function run(action: Action) {
    // Must happen inside the click, before any await, or the browser blocks the new tab.
    const tab = action === 'whatsapp' ? window.open('', '_blank') : null;
    setBusy(action);
    setError(null);
    let current = link && linkKey.current === key ? link : null;
    if (!current) {
      const result = await requestPdf(request);
      if (result.error) {
        tab?.close();
        setBusy(null);
        setError(result.error);
        return;
      }
      current = result.link;
      linkKey.current = key;
      setLink(current);
    }
    const exp = current.expiresAt ? expiryFmt.format(new Date(current.expiresAt)) : '';
    const m = messages(current, exp);
    setBusy(null);
    if (action === 'download') {
      // Answered with Content-Disposition: attachment, so the page stays where it is.
      window.location.assign(downloadUrl(current));
    } else if (action === 'email') {
      window.location.assign(mailtoLink(contact?.email, m.subject, m.body));
    } else {
      const url = whatsappLink(contact?.phone, m.whatsapp);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (insecure context): the "Abrir el PDF" link still carries it.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'download'}
          disabled={busy !== null}
          onClick={() => void run('download')}
        >
          <Download aria-hidden size={16} />
          {t('clientReports.share.download')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'email'}
          disabled={busy !== null}
          onClick={() => void run('email')}
        >
          <Mail aria-hidden size={16} />
          {t('clientReports.share.email')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'whatsapp'}
          disabled={busy !== null}
          onClick={() => void run('whatsapp')}
        >
          <MessageCircle aria-hidden size={16} />
          {t('clientReports.share.whatsapp')}
        </Button>
      </div>

      {!contact?.email && (
        <p className="text-xs text-text-muted">{t('clientReports.share.noEmail')}</p>
      )}
      {!contact?.phone && (
        <p className="text-xs text-text-muted">{t('clientReports.share.noPhone')}</p>
      )}

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {busy && <p className="text-sm text-text-muted">{t('clientReports.share.preparing')}</p>}
        {error && (
          <Alert tone={error === 'not_ready' ? 'warning' : 'error'}>
            {t(`clientReports.errors.${error}`)}
          </Alert>
        )}
        {link && !error && (
          <Alert tone="success">
            <p>{t('clientReports.share.ready', { count: link.pages, date: expires })}</p>
            {link.warnings.map((w) => (
              <p key={w} className="mt-1">
                {t(`clientReports.warnings.${w}`, { defaultValue: '' })}
              </p>
            ))}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-medium">
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline">
                {t('clientReports.share.openPdf')}
              </a>
              <button type="button" onClick={() => void copy()} className="underline">
                {copied ? t('clientReports.share.copied') : t('clientReports.share.copy')}
              </button>
              {mailHref && (
                <a href={mailHref} className="underline">
                  {t('clientReports.share.openEmail')}
                </a>
              )}
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline">
                  {t('clientReports.share.openWhatsapp')}
                </a>
              )}
            </p>
          </Alert>
        )}
      </div>
    </div>
  );
}
