import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { CalendarDays } from 'lucide-react';
import { cn, parseISODate, toISODate } from './utils.js';
import { controlClass } from './Input.js';
import { Popover, PopoverContent, PopoverTrigger } from './Popover.js';

const display = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Calendar date picker. Value is a `YYYY-MM-DD` string, the same shape `<input type="date">`
 * gives, so it drops into existing forms. Pass `name` to submit it natively.
 */
export function DatePicker({
  value,
  onValueChange,
  placeholder,
  id,
  name,
  label,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  id?: string;
  name?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = parseISODate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={label}
        disabled={disabled}
        className={cn(
          controlClass,
          'inline-flex h-10 items-center gap-2 text-left',
          !date && 'text-text-muted',
          className,
        )}
      >
        <CalendarDays aria-hidden size={16} className="shrink-0 text-text-muted" />
        <span className="flex-1 truncate tabular-nums">
          {date ? display.format(date) : placeholder}
        </span>
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent className="cloro-calendar p-3">
        <DayPicker
          mode="single"
          locale={es}
          weekStartsOn={1}
          autoFocus
          selected={date}
          defaultMonth={date}
          onSelect={(d) => {
            if (d) onValueChange(toISODate(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
