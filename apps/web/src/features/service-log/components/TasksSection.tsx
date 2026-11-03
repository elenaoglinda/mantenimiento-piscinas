import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';
import { doneCount, setTaskNote, toggleTask, type TaskDef, type TaskEntry } from '@piscinas/shared';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { cn, focusRing } from '../../../components/ui/utils.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

/**
 * "Tareas": the org's checklist, one large tap target per task, plus an optional note. Only
 * tasks that were done or got a note are saved.
 */
export function TasksSection({
  defs,
  failure,
  value,
  onChange,
  disabled = false,
}: {
  defs: TaskDef[] | null;
  failure: DbFailure | null;
  /** null while loading. */
  value: TaskEntry[] | null;
  onChange: (next: TaskEntry[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [noteOpen, setNoteOpen] = useState<Set<string>>(new Set());

  if (failure) return <ServiceLogAlert failure={failure} />;
  if (!defs || !value) return <Skeleton className="h-24 w-full" />;
  if (value.length === 0)
    return <p className="text-sm text-text-muted">{t('serviceLog.tasks.emptyList')}</p>;

  const name = new Map(defs.map((d) => [d.id, d.nombre]));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted" aria-live="polite">
        {t('serviceLog.tasks.doneOf', { count: doneCount(value), total: value.length })}
      </p>
      <ul aria-label={t('serviceLog.tasks.title')} className="flex flex-col gap-1.5">
        {value.map((e) => {
          const label = name.get(e.taskId) ?? '—';
          const showNote = noteOpen.has(e.taskId) || e.nota !== '';
          const noteId = `task-note-${e.taskId}`;
          return (
            <li
              key={e.taskId}
              className={cn(
                'rounded-[var(--radius-md)] border px-3 py-1 transition-colors',
                e.hecho ? 'border-accent/40 bg-accent-soft/60' : 'border-border bg-surface',
              )}
            >
              <div className="flex items-center gap-2">
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={e.hecho}
                    disabled={disabled}
                    onChange={() => onChange(toggleTask(value, e.taskId))}
                    className={cn('size-5 shrink-0 accent-[var(--accent)]', focusRing)}
                  />
                  {label}
                </label>
                {!showNote && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t('serviceLog.tasks.addNote', { name: label })}
                    title={t('serviceLog.tasks.addNote', { name: label })}
                    onClick={() => setNoteOpen((s) => new Set(s).add(e.taskId))}
                    className={cn(
                      'inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted hover:text-text',
                      focusRing,
                    )}
                  >
                    <MessageSquarePlus aria-hidden size={16} />
                  </button>
                )}
              </div>
              {showNote && (
                <input
                  id={noteId}
                  value={e.nota}
                  disabled={disabled}
                  autoFocus={noteOpen.has(e.taskId) && e.nota === ''}
                  onChange={(ev) => onChange(setTaskNote(value, e.taskId, ev.target.value))}
                  placeholder={t('serviceLog.tasks.notePlaceholder')}
                  aria-label={t('serviceLog.tasks.noteOf', { name: label })}
                  className="mb-1.5 h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-sm text-text outline-none placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus/40"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
