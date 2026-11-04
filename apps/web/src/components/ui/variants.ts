import { cva } from 'class-variance-authority';
import { focusRing } from './utils.js';

export const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60 [&_svg]:shrink-0 ${focusRing}`,
  {
    variants: {
      variant: {
        /** One per view: the action the page exists for. */
        primary: 'bg-primary text-primary-contrast hover:bg-primary-hover',
        /** Everything else that is still a button. */
        secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
        /** Toolbars, table rows, icon buttons. */
        ghost: 'text-text hover:bg-surface-muted',
        /** Irreversible actions (anular, eliminar). */
        danger: 'bg-status-red-text text-white hover:bg-status-red-text/90',
        /** Inline, reads as a link. */
        link: 'h-auto px-0 py-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'size-9',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type Tone = 'green' | 'amber' | 'red' | 'unknown' | 'info' | 'neutral';

/** Background + text pairs that pass WCAG AA (see styles/README → status colours). */
export const toneClass: Record<Tone, string> = {
  green: 'bg-status-green-bg text-status-green-text',
  amber: 'bg-status-amber-bg text-status-amber-text',
  red: 'bg-status-red-bg text-status-red-text',
  unknown: 'bg-status-unknown-bg text-status-unknown-text',
  info: 'bg-accent-soft text-navy-800',
  neutral: 'bg-surface-muted text-text-muted',
};
