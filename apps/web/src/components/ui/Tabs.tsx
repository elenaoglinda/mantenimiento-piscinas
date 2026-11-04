import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn, focusRing } from './utils.js';

const listClass = 'flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]';
const triggerClass = cn(
  'relative -mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-50',
  focusRing,
);
const activeClass = 'border-accent text-navy-800';

/** In-page tabs (Radix): arrow keys move between tabs, content panels are linked by id. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />;
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        triggerClass,
        'data-[state=active]:border-accent data-[state=active]:text-navy-800',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-6 outline-none', className)} {...props} />;
}

export interface TabLink {
  to: string;
  label: ReactNode;
  /** Match the path exactly (for an index tab like /invoices). */
  end?: boolean;
  disabled?: boolean;
  /** Shown on hover/focus of a disabled tab, e.g. "Próximamente". */
  hint?: string;
}

/**
 * Tabs that are routes (each tab has its own URL). Same look as `Tabs`, but a `<nav>` of links
 * so back/forward and deep links keep working.
 */
export function TabsNav({
  items,
  label,
  className,
}: {
  items: TabLink[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(listClass, className)}>
      {items.map((item) =>
        item.disabled ? (
          <span
            key={item.to}
            aria-disabled="true"
            title={item.hint}
            className={cn(triggerClass, 'cursor-not-allowed opacity-50 hover:text-text-muted')}
          >
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(triggerClass, isActive && activeClass)}
          >
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
