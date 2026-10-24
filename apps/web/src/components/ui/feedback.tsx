import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from './utils.js';

export { Card } from './Card.js';

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 text-text-muted">
      <span
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

type AlertTone = 'error' | 'warning' | 'success' | 'info';

const toneStyles: Record<AlertTone, string> = {
  error: 'border-status-red/30 bg-status-red-bg text-status-red-text',
  warning: 'border-status-amber/30 bg-status-amber-bg text-status-amber-text',
  success: 'border-status-green/30 bg-status-green-bg text-status-green-text',
  info: 'border-border bg-surface-muted text-text',
};

const toneIcon = {
  error: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
} as const;

/** Inline message. Errors are announced immediately (`role="alert"`), the rest politely. */
export function Alert({
  tone = 'info',
  className,
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}) {
  const Icon = toneIcon[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm',
        toneStyles[tone],
        className,
      )}
    >
      <Icon aria-hidden size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
