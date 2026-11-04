import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../ui/Card.js';
import { cn, focusRing } from '../ui/utils.js';
import { madridTime, monthGrid, type RouteLite } from '../../lib/dashboard.js';

interface RoutesCalendarProps {
  year: number;
  month0: number; // 0-based
  today: string; // Madrid 'YYYY-MM-DD'
  routesByDate: Map<string, RouteLite[]>;
  onPrev: () => void;
  onNext: () => void;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function RoutesCalendar({
  year,
  month0,
  today,
  routesByDate,
  onPrev,
  onNext,
}: RoutesCalendarProps) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(today);

  const grid = monthGrid(year, month0, today);
  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month0, 1)));

  const selectedRoutes = routesByDate.get(selected) ?? [];
  const selectedStops = selectedRoutes.flatMap((r) => r.stops).sort((a, b) => a.seq - b.seq);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">{t('dashboard.calendarTitle')}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('dashboard.prevMonth')}
            onClick={onPrev}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted hover:text-text',
              focusRing,
            )}
          >
            <ChevronLeft aria-hidden size={16} />
          </button>
          <span className="inline-block min-w-32 text-center text-sm font-medium text-text first-letter:uppercase">
            {monthLabel}
          </span>
          <button
            type="button"
            aria-label={t('dashboard.nextMonth')}
            onClick={onNext}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted hover:text-text',
              focusRing,
            )}
          >
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-xs font-medium text-text-muted">
            {w}
          </div>
        ))}
        {grid.map((day) => {
          const dayRoutes = routesByDate.get(day.date) ?? [];
          const count = dayRoutes.length;
          const stopCount = dayRoutes.reduce((n, r) => n + r.stops.length, 0);
          const isSelected = day.date === selected;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelected(day.date)}
              aria-pressed={isSelected}
              aria-label={
                count > 0
                  ? `${Number(day.date.slice(8, 10))} · ${t('dashboard.stops', { count: stopCount })}`
                  : undefined
              }
              className={`relative flex h-10 w-full min-w-0 flex-col items-center justify-center rounded-[var(--radius-md)] text-sm tabular-nums transition-colors ${focusRing} ${
                isSelected
                  ? 'bg-primary text-primary-contrast'
                  : day.inMonth
                    ? 'text-text hover:bg-surface-muted'
                    : 'text-text-muted hover:bg-surface-muted'
              } ${day.isToday && !isSelected ? 'ring-1 ring-accent' : ''}`}
            >
              {Number(day.date.slice(8, 10))}
              {count > 0 && (
                <span
                  aria-hidden
                  className={`mt-0.5 size-1.5 rounded-full ${
                    isSelected ? 'bg-primary-contrast' : 'bg-accent'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text first-letter:uppercase">
          {new Intl.DateTimeFormat(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }).format(new Date(`${selected}T00:00:00Z`))}
        </p>
        {selectedStops.length === 0 ? (
          <p className="text-sm text-text-muted">{t('dashboard.noVisitsPlanned')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedStops.map((stop, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{stop.poolName}</p>
                  {stop.clientName && (
                    <p className="truncate text-xs text-text-muted">{stop.clientName}</p>
                  )}
                </div>
                {stop.eta && (
                  <span className="shrink-0 text-sm text-text-muted">{madridTime(stop.eta)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/routes"
          className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
        >
          {t('dashboard.planRouteLink')}
        </Link>
      </div>
    </Card>
  );
}
