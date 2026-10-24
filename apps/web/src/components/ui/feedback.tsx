import type { ReactNode } from 'react';

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

type AlertTone = 'error' | 'success' | 'info';

const toneStyles: Record<AlertTone, string> = {
  error: 'bg-status-red-bg text-status-red-text',
  success: 'bg-status-green-bg text-status-green-text',
  info: 'bg-surface-muted text-text',
};

export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[var(--radius-md)] px-4 py-3 text-sm ${toneStyles[tone]}`}
    >
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
