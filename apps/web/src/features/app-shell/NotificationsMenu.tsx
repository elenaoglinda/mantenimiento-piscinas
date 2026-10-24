import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Receipt, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover.js';
import { cn, focusRing } from '../../components/ui/utils.js';
import { useShellData } from './shellData.js';

/**
 * The bell: what needs attention right now — out-of-range readings from the last 30 days and
 * invoices the AEAT rejected or that couldn't be sent. Derived on each navigation, so there's
 * nothing to mark as read: an alert goes away when its cause is fixed.
 */
export function NotificationsMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { alerts } = useShellData();
  const [open, setOpen] = useState(false);
  const count = alerts?.length ?? 0;
  const label = count > 0 ? t('shell.alerts.labelCount', { count }) : t('shell.alerts.title');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface-muted hover:text-text',
          focusRing,
          className,
        )}
      >
        <Bell aria-hidden size={18} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-status-red-text px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-text">{t('shell.alerts.title')}</p>
        </div>
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span
              aria-hidden
              className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent"
            >
              <ShieldCheck size={20} />
            </span>
            <p className="text-sm font-medium text-text">{t('shell.alerts.empty')}</p>
            <p className="text-xs text-text-muted">{t('shell.alerts.emptyHint')}</p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {alerts!.map((a) => {
              const Icon = a.kind === 'reading' ? TriangleAlert : Receipt;
              return (
                <li key={a.id}>
                  <Link
                    to={a.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted',
                      focusRing,
                    )}
                  >
                    <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-status-red-text" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">
                        {a.title || '—'}
                      </span>
                      <span className="block text-xs text-text-muted">{a.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
