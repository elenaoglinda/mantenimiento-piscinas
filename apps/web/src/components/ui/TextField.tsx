import type { InputHTMLAttributes } from 'react';
import { Field, Input } from './Input.js';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** `Field` + `Input` in one, for the common case. */
export function TextField({ label, hint, error, ...rest }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      <Input {...rest} />
    </Field>
  );
}
