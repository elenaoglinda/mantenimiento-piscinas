import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils.js';

export interface Crumb {
  label: ReactNode;
  /** Omit for the current page and for groups that aren't pages. */
  to?: string;
}

/**
 * "Operación › Piscinas › Villa Mar". The last crumb is the current page. On phones only the
 * last crumb shows (set `collapseOnMobile={false}` to keep the trail).
 */
export function Breadcrumb({
  items,
  label,
  collapseOnMobile = true,
  className,
}: {
  items: Crumb[];
  /** Accessible name of the `<nav>`, e.g. "Ruta de navegación". */
  label: string;
  collapseOnMobile?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const hideHere = collapseOnMobile && !last;
          return (
            <li
              key={i}
              className={cn('min-w-0 items-center gap-1.5', hideHere ? 'hidden sm:flex' : 'flex')}
            >
              {i > 0 && (
                <ChevronRight
                  aria-hidden
                  size={14}
                  className={cn('shrink-0 text-text-muted', collapseOnMobile && 'hidden sm:block')}
                />
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text">
                  {c.label}
                </span>
              ) : c.to ? (
                <Link to={c.to} className="truncate text-text-muted hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-text-muted">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
