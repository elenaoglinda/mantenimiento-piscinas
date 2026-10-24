import type { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './utils.js';
import { controlClass } from './Input.js';

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Custom-rendered select (Radix) for filters and toolbars — e.g. the SILOÉ year. Inside forms
 * that submit natively, prefer `NativeSelect`.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  id,
  className,
  disabled,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Accessible name when there is no visible `<label htmlFor={id}>`. */
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        className={cn(
          controlClass,
          'inline-flex h-10 items-center justify-between gap-2 text-left data-[placeholder]:text-text-muted',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden size={16} className="text-text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-card"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-9 cursor-pointer items-center rounded-[var(--radius-sm)] pr-3 pl-8 text-sm text-text outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft data-[highlighted]:text-navy-800"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex">
                  <Check aria-hidden size={14} className="text-accent" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
