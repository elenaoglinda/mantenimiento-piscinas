import { useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from './utils.js';
import { controlClass } from './Input.js';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from './Command.js';
import { Popover, PopoverContent, PopoverTrigger } from './Popover.js';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line, e.g. a pool's client. Also searched. */
  detail?: string;
}

/**
 * A select you can type into — for long lists like pools or clients. Pass `name` to submit the
 * value with a native form.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  id,
  name,
  label,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: ReactNode;
  id?: string;
  name?: string;
  /** Accessible name when there is no visible `<label htmlFor={id}>`. */
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        className={cn(
          controlClass,
          'inline-flex h-10 items-center justify-between gap-2 text-left',
          !selected && 'text-text-muted',
          className,
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown aria-hidden size={16} className="shrink-0 text-text-muted" />
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                keywords={[o.label, o.detail ?? '']}
                onSelect={() => {
                  onValueChange(o.value);
                  setOpen(false);
                }}
                className="h-auto min-h-10 py-1.5"
              >
                <Check
                  aria-hidden
                  size={14}
                  className={cn(
                    'shrink-0 text-accent',
                    o.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.detail && (
                    <span className="block truncate text-xs text-text-muted">{o.detail}</span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
