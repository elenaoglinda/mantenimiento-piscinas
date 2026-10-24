import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn, foldFilter } from './utils.js';

/**
 * Searchable list of actions (cmdk). Arrow keys move, Enter picks, typing filters. Use inside a
 * `CommandDialog` for a ⌘K palette or inside a `Popover` for a `Combobox`.
 */
export function Command({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      filter={foldFilter}
      className={cn('flex w-full flex-col overflow-hidden bg-surface text-text', className)}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search aria-hidden size={16} className="shrink-0 text-text-muted" />
      <CommandPrimitive.Input
        className={cn(
          'h-11 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-80 overflow-y-auto overscroll-contain p-1.5', className)}
      {...props}
    />
  );
}

export function CommandEmpty({ children }: { children: ReactNode }) {
  return (
    <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-text-muted">
      {children}
    </CommandPrimitive.Empty>
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm text-text outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent-soft data-[selected=true]:text-navy-800',
        className,
      )}
      {...props}
    />
  );
}

/** ⌘K-style palette: a `Command` in a modal dialog near the top of the screen. */
export function CommandDialog({
  open,
  onOpenChange,
  label,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the dialog and the list. */
  label: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-navy-900/40" />
        <DialogPrimitive.Content className="fixed top-[12vh] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-card outline-none">
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{label}</DialogPrimitive.Description>
          <Command label={label} loop>
            {children}
          </Command>
          {footer && (
            <div className="flex flex-col gap-0.5 border-t border-border bg-surface-muted px-4 py-2 text-xs text-text-muted sm:flex-row sm:justify-between">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
