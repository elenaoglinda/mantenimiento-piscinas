import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing } from './utils.js';
import { Skeleton } from './Skeleton.js';

/**
 * KPI tile: label, a big number, and a line of context. Links when `to` is set, so the whole
 * card is the target.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  to,
  loading = false,
  tone = 'default',
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  to?: string;
  loading?: boolean;
  /** `alert` tints the number red, for counts that need attention. */
  tone?: 'default' | 'alert';
  /** Extra content under the value, e.g. a `ProgressBar`. */
  children?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        {icon && (
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"
          >
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p
          className={cn(
            'mt-2 font-display text-[28px] leading-9 font-semibold tabular-nums',
            tone === 'alert' ? 'text-status-red-text' : 'text-text',
          )}
        >
          {value}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </>
  );

  const base = cn(
    'block rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-card',
    className,
  );
  return to ? (
    <Link to={to} className={cn(base, 'transition-colors hover:border-accent', focusRing)}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
