import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = '', ...rest }: TextFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`rounded-[var(--radius-md)] border bg-surface px-3 py-2.5 text-text outline-none transition-colors placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 ${
          error ? 'border-status-red' : 'border-border'
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-status-red">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
