import { useTranslation } from 'react-i18next';
import { activeFilterCount, type VisitFilters as Filters } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Field, Input, NativeSelect } from '../../../components/ui/Input.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import type { Option } from '../lib/data.js';

/**
 * The Informes filters: date range, client (companies only), pool, technician and "solo fuera
 * de rango". Controlled: the page keeps the values in the URL and passes them in.
 */
export function VisitFilters({
  filters,
  onChange,
  onClear,
  clients,
  pools,
  technicians,
  showClient,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
  clients: Option[];
  pools: Option[];
  technicians: Option[];
  showClient: boolean;
}) {
  const { t } = useTranslation();
  // With a client chosen, only that client's pools are offered.
  const poolOptions = filters.client ? pools.filter((p) => p.clientId === filters.client) : pools;
  const active = activeFilterCount({ ...filters, status: null });

  return (
    <div className="mb-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Field label={t('history.filters.from')}>
        <Input
          type="date"
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(e) => onChange({ from: e.target.value || null })}
        />
      </Field>
      <Field label={t('history.filters.to')}>
        <Input
          type="date"
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(e) => onChange({ to: e.target.value || null })}
        />
      </Field>
      {showClient && (
        <Field label={t('pools.client')} className="col-span-2 sm:col-span-1">
          <NativeSelect
            value={filters.client ?? ''}
            onChange={(e) => {
              const client = e.target.value || null;
              const pool = pools.find((p) => p.id === filters.pool);
              // Changing client drops a pool that isn't theirs.
              onChange({
                client,
                ...(client && pool && pool.clientId !== client ? { pool: null } : {}),
              });
            }}
          >
            <option value="">{t('history.filters.allClients')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label={t('reports.pool')} className="col-span-2 sm:col-span-1">
        <NativeSelect
          value={filters.pool ?? ''}
          onChange={(e) => onChange({ pool: e.target.value || null })}
        >
          <option value="">{t('history.filters.allPools')}</option>
          {poolOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('history.filters.technician')} className="col-span-2 sm:col-span-1">
        <NativeSelect
          value={filters.technician ?? ''}
          onChange={(e) => onChange({ technician: e.target.value || null })}
        >
          <option value="">{t('history.filters.allTechnicians')}</option>
          {technicians.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="col-span-2 flex h-10 items-center gap-3 sm:col-span-1">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-text">
          <input
            type="checkbox"
            checked={filters.outOfRange}
            onChange={(e) => onChange({ outOfRange: e.target.checked })}
            className={cn('size-4 accent-[var(--status-red-text)]', focusRing)}
          />
          {t('history.filters.outOfRange')}
        </label>
      </div>
      {active > 0 && (
        <div className="col-span-2 sm:col-span-3 lg:col-span-6">
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t('history.filters.clearCount', { count: active })}
          </Button>
        </div>
      )}
    </div>
  );
}
