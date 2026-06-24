import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface AddressSuggestion {
  placeName: string;
  direccion: string;
  cp: string | null;
  localidad: string | null;
  provincia: string | null;
  lat: number;
  lng: number;
}

/**
 * Debounced address search backed by /api/address-suggest (Mapbox). On selection it returns
 * the full parsed address so the caller can fill direccion/cp/localidad/provincia/lat/lng.
 * Falls back silently when the service is unavailable (manual fields still work).
 */
export function AddressAutocomplete({
  value,
  onTextChange,
  onSelect,
}: {
  value: string;
  onTextChange: (text: string) => void;
  onSelect: (s: AddressSuggestion) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/address-suggest?q=${encodeURIComponent(value)}`);
        if (!resp.ok) return;
        const data = (await resp.json()) as { suggestions: AddressSuggestion[] };
        setSuggestions(data.suggestions);
        setOpen(true);
      } catch {
        /* offline / unavailable — manual entry still works */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  function choose(s: AddressSuggestion) {
    skipNextFetch.current = true;
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {t('pools.searchAddress')}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={t('pools.addressPlaceholder')}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-text outline-none transition-colors placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-muted"
              >
                {s.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
