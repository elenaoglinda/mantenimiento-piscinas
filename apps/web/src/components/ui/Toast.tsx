import { useSyncExternalStore } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, focusRing } from './utils.js';
import { dismiss, getToasts, subscribe } from './toast.js';

const icon = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const iconTone = {
  success: 'text-status-green-text',
  error: 'text-status-red-text',
  info: 'text-accent',
} as const;

/** Mount once near the root. Renders the queue bottom-right (bottom on phones). */
export function Toaster() {
  const { t } = useTranslation();
  const list = useSyncExternalStore(subscribe, getToasts);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {list.map((item) => {
        const Icon = icon[item.tone];
        return (
          <ToastPrimitive.Root
            key={item.id}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-card data-[state=open]:animate-[toast-in_180ms_ease-out] data-[swipe=end]:animate-[fade-out_120ms_ease-in]"
          >
            <Icon aria-hidden size={18} className={cn('mt-0.5 shrink-0', iconTone[item.tone])} />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-text">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-text-muted">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label={t('common.close')}
              className={cn(
                '-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-muted hover:text-text',
                focusRing,
              )}
            >
              <X aria-hidden size={16} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport
        label={t('ui.notifications')}
        className="fixed right-0 bottom-0 z-[80] flex w-full max-w-sm flex-col gap-2 p-4 outline-none"
      />
    </ToastPrimitive.Provider>
  );
}
