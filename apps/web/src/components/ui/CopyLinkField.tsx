import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Read-only link with a copy-to-clipboard button. Used for share-link invitations. */
export function CopyLinkField({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context): the input is selectable as a fallback.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        aria-label={t('invitations.linkLabel')}
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface-muted px-3 py-2 text-sm text-text"
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-muted"
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}
