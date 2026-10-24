import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, focusRing } from './utils.js';

/**
 * Horizontal scroll container for wide tables. When (and only when) its content overflows it
 * becomes a focusable, labelled region, so keyboard users can scroll it with the arrow keys
 * (WCAG 2.1.1; axe `scrollable-region-focusable`) without an extra tab stop the rest of the time.
 */
export function HScroll({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? label : undefined}
      className={cn('overflow-x-auto', scrollable && focusRing, className)}
    >
      {children}
    </div>
  );
}
