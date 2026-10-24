import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Field, NativeSelect, Textarea } from './Input.js';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  children: ReactNode;
}

/** `Field` + `NativeSelect`. */
export function SelectField({ label, hint, children, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <NativeSelect {...rest}>{children}</NativeSelect>
    </Field>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

/** `Field` + `Textarea`. */
export function TextareaField({ label, hint, ...rest }: TextareaFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <Textarea {...rest} />
    </Field>
  );
}
