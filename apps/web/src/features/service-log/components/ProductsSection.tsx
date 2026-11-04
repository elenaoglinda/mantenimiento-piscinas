import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, X } from 'lucide-react';
import {
  addProduct,
  removeProduct,
  setQuantity,
  type ChemicalEntry,
  type ChemicalProduct,
} from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

/**
 * "Productos añadidos": one tap on a product chip adds it with its usual quantity and puts the
 * cursor in the quantity field; tap again to remove. Built for a phone held in one hand.
 */
export function ProductsSection({
  products,
  failure,
  value,
  onChange,
  invalid = [],
  disabled = false,
}: {
  /** null while loading. */
  products: ChemicalProduct[] | null;
  failure: DbFailure | null;
  value: ChemicalEntry[];
  onChange: (next: ChemicalEntry[]) => void;
  /** Product ids whose quantity is missing or not a number (after a save attempt). */
  invalid?: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const inputs = useRef(new Map<string, HTMLInputElement>());

  if (failure) return <ServiceLogAlert failure={failure} />;
  if (!products) return <Skeleton className="h-10 w-full" />;

  const byId = new Map(products.map((p) => [p.id, p]));
  // Inactive products stay visible only if this visit already uses them.
  const chips = products.filter((p) => p.activo || value.some((e) => e.productId === p.id));

  if (chips.length === 0)
    return <p className="text-sm text-text-muted">{t('serviceLog.products.emptyCatalogue')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t('serviceLog.products.pick')} className="flex flex-wrap gap-2">
        {chips.map((p) => {
          const on = value.some((e) => e.productId === p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => {
                if (on) onChange(removeProduct(value, p.id));
                else {
                  onChange(addProduct(value, p));
                  // Next frame: the row exists, so the quantity field can take focus.
                  requestAnimationFrame(() => inputs.current.get(p.id)?.focus());
                }
              }}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-full)] border px-3.5 text-sm font-medium transition-colors disabled:opacity-60',
                focusRing,
                on
                  ? 'border-accent bg-accent-soft text-navy-800'
                  : 'border-border bg-surface text-text hover:bg-surface-muted',
              )}
            >
              {on ? <Check aria-hidden size={14} /> : <Plus aria-hidden size={14} />}
              {p.nombre}
            </button>
          );
        })}
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-text-muted">{t('serviceLog.products.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {value.map((e) => {
            const p = byId.get(e.productId);
            const name = p?.nombre ?? '—';
            const bad = invalid.includes(e.productId);
            const errorId = `qty-error-${e.productId}`;
            return (
              <li
                key={e.productId}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-text">{name}</span>
                <span className="flex flex-col items-end">
                  <span className="flex items-center gap-1.5">
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(e.productId, el);
                        else inputs.current.delete(e.productId);
                      }}
                      inputMode="decimal"
                      value={e.cantidad}
                      disabled={disabled}
                      onChange={(ev) => onChange(setQuantity(value, e.productId, ev.target.value))}
                      aria-label={t('serviceLog.products.quantityOf', { name })}
                      aria-invalid={bad || undefined}
                      aria-describedby={bad ? errorId : undefined}
                      className={cn(
                        'h-10 w-20 rounded-[var(--radius-md)] border bg-surface px-2.5 text-right text-text tabular-nums outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40',
                        bad ? 'border-status-red' : 'border-border',
                      )}
                    />
                    <span className="w-16 text-sm text-text-muted">{e.unidad}</span>
                  </span>
                  {bad && (
                    <span id={errorId} className="text-xs text-status-red-text">
                      {t('serviceLog.products.quantityRequired')}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={t('serviceLog.products.remove', { name })}
                  title={t('serviceLog.products.remove', { name })}
                  onClick={() => onChange(removeProduct(value, e.productId))}
                >
                  <X aria-hidden size={16} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
