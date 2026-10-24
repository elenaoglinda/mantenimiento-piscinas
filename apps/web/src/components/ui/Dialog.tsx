import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, focusRing } from './utils.js';
import { useReturnFocus } from './useReturnFocus.js';

/**
 * Modal dialog (Radix): traps focus, closes on Esc and backdrop click, returns focus to the
 * trigger and hides the rest of the page from screen readers.
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="Nueva piscina">…</Dialog>
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'md',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  useReturnFocus(open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/40 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col rounded-t-[var(--radius-lg)] border border-border bg-surface shadow-card outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)] data-[state=open]:animate-[dialog-in_160ms_ease-out]',
            { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-semibold text-text">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className={cn(
                '-mt-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted hover:text-text',
                focusRing,
              )}
            >
              <X aria-hidden size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Side panel (Radix Dialog anchored to the right). For create/edit forms that benefit from
 * keeping the list visible behind them. Full width on phones.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  useReturnFocus(open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/40 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-card outline-none sm:max-w-md data-[state=open]:animate-[sheet-in_200ms_ease-out]">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-semibold text-text">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className={cn(
                '-mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted hover:text-text',
                focusRing,
              )}
            >
              <X aria-hidden size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
