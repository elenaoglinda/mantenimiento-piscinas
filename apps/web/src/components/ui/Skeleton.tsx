import type { HTMLAttributes } from 'react';
import { cn } from './utils.js';

/** Grey placeholder block shown while data loads. Size it with classes (`h-4 w-32`). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[var(--radius-sm)] bg-surface-muted', className)}
      {...props}
    />
  );
}

/** A few lines of text-shaped skeleton, for cards and panels. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
