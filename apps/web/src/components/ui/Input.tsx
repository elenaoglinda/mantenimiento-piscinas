import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils.js';

/** Base look shared by every text-like control, so inputs, selects and textareas line up. */
export const controlClass =
  'w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-text outline-none transition-colors placeholder:text-text-muted hover:border-text-muted/50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted aria-invalid:border-status-red aria-invalid:focus-visible:ring-status-red/30';

interface FieldIds {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldIds | null>(null);

/**
 * Label + control + hint/error. Controls rendered inside pick up `id`, `aria-describedby`
 * and `aria-invalid` automatically, so the label is always wired to its input.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {children}
        {error ? (
          <p id={`${id}-error`} className="text-xs text-status-red-text">
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-xs text-text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Props a control should take from an enclosing `Field`, unless the caller overrides them. */
function useFieldProps<T extends { id?: string; 'aria-describedby'?: string }>(props: T) {
  const field = useContext(FieldContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    'aria-describedby': props['aria-describedby'] ?? field.describedBy,
    'aria-invalid':
      (props as { 'aria-invalid'?: unknown })['aria-invalid'] ?? (field.invalid || undefined),
  };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const p = useFieldProps(props);
    return <input ref={ref} className={cn(controlClass, 'h-10', className)} {...p} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  const p = useFieldProps(props);
  return (
    <textarea ref={ref} rows={rows} className={cn(controlClass, 'py-2.5', className)} {...p} />
  );
});

/**
 * A styled native `<select>`. Use it inside forms: it submits, validates and works with the
 * phone's own picker. For a custom-rendered list, use `Select` (Radix) instead.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, children, ...props }, ref) {
    const p = useFieldProps(props);
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(controlClass, 'h-10 appearance-none pr-9', className)}
          {...p}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          size={16}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted"
        />
      </div>
    );
  },
);
