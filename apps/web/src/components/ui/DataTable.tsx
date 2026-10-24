import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { cn, focusRing } from './utils.js';
import { Input } from './Input.js';
import { Skeleton } from './Skeleton.js';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
  /** Hide on narrow screens to keep the table readable on a phone. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

type Sort = { id: string; dir: 'asc' | 'desc' } | null;

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * List of records as a table: sortable headers, skeleton rows while loading, a designed empty
 * state, and whole-row links. The first cell holds the real `<Link>` so keyboard and screen
 * reader users get a proper link; clicking anywhere else on the row follows it too.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowHref,
  loading = false,
  empty,
  caption,
  initialSort = null,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  loading?: boolean;
  /** Shown instead of rows when `rows` is empty — usually an `EmptyState`. */
  empty?: ReactNode;
  /** Accessible table name. */
  caption: string;
  initialSort?: Sort;
  className?: string;
}) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<Sort>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // blanks last, whichever direction
      if (vb == null) return -1;
      const c =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : collator.compare(String(va), String(vb));
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [rows, sort, columns]);

  const toggle = (id: string) =>
    setSort((s) =>
      s?.id === id ? (s.dir === 'asc' ? { id, dir: 'desc' } : null) : { id, dir: 'asc' },
    );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-card',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-muted/60">
              {columns.map((col) => {
                const active = sort?.id === col.id ? sort.dir : null;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'h-10 px-4 text-xs font-semibold whitespace-nowrap text-text-muted',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.hideBelow && hide[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(col.id)}
                        className={cn(
                          '-mx-1 inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1 hover:text-text',
                          focusRing,
                        )}
                      >
                        {col.header}
                        {active === 'asc' ? (
                          <ArrowUp aria-hidden size={12} />
                        ) : active === 'desc' ? (
                          <ArrowDown aria-hidden size={12} />
                        ) : (
                          <ChevronsUpDown aria-hidden size={12} className="opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn('h-12 px-4', col.hideBelow && hide[col.hideBelow])}
                    >
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{empty}</td>
              </tr>
            ) : (
              sorted.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={getRowId(row)}
                    onClick={
                      href
                        ? (e) => {
                            // Let real links, buttons and inputs inside the row do their own thing.
                            if (
                              (e.target as HTMLElement).closest(
                                'a,button,input,select,textarea,label',
                              )
                            )
                              return;
                            navigate(href);
                          }
                        : undefined
                    }
                    className={cn(
                      'border-b border-border last:border-0',
                      href && 'cursor-pointer transition-colors hover:bg-surface-muted/60',
                    )}
                  >
                    {columns.map((col, ci) => (
                      <td
                        key={col.id}
                        className={cn(
                          'h-12 px-4 py-2 align-middle text-text',
                          col.align === 'right' && 'text-right tabular-nums',
                          col.hideBelow && hide[col.hideBelow],
                          col.className,
                        )}
                      >
                        {ci === 0 && href ? (
                          <Link
                            to={href}
                            className={cn(
                              'font-medium text-text hover:text-accent',
                              focusRing,
                              'rounded-[var(--radius-sm)]',
                            )}
                          >
                            {col.cell(row)}
                          </Link>
                        ) : (
                          col.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Search box + filters row above a table. Filtering itself stays in the page. */
export function TableToolbar({
  search,
  onSearch,
  searchPlaceholder,
  searchLabel,
  children,
  actions,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Filter controls (Select, StatusPill toggles…). */
  children?: ReactNode;
  /** Right-aligned, e.g. an export button. */
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      {onSearch && (
        <div className="relative sm:w-72">
          <Search
            aria-hidden
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel ?? searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}
