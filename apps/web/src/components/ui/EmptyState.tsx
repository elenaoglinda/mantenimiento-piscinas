import type { ReactNode } from 'react';
import { cn } from './utils.js';

/**
 * What a list shows when it has nothing in it: why it's empty and the one thing to do next.
 * "Todavía no hay piscinas · Añade la primera para empezar a registrar visitas · [Nueva piscina]".
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Smaller padding, for empty panels inside a card. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-accent-soft text-accent',
            compact ? 'size-10' : 'size-12',
          )}
        >
          {icon}
        </span>
      )}
      <p className="font-display text-base font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
