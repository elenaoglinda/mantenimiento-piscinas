import {
  useId,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';

const controlClass =
  'rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-text outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40';

function FieldShell({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function SelectField({ label, children, className = '', ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} id={id}>
      <select id={id} className={`${controlClass} ${className}`} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextareaField({ label, className = '', ...rest }: TextareaFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} id={id}>
      <textarea id={id} rows={3} className={`${controlClass} ${className}`} {...rest} />
    </FieldShell>
  );
}
