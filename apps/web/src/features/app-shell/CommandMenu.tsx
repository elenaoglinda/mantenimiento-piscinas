import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileUp, Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/context.js';
import { visibleGroups } from './nav.js';

/**
 * ⌘K palette. Phase 2 jumps to pages and the two quick actions; searching records (pools,
 * clients, reports) is a follow-up and the palette says so rather than pretending.
 */
interface Entry {
  to: string;
  label: string;
  section: 'pages' | 'actions';
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

/** Accent- and case-insensitive, so "silo" finds "SILOÉ" and "facturacion" finds "Facturación". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = visibleGroups(profile?.org.type).flatMap((g) =>
      g.items.map((i) => ({ to: i.to, label: t(i.labelKey), section: 'pages', icon: i.icon })),
    );
    const canWrite = profile ? profile.user.role !== 'viewer' : false;
    const actions: Entry[] = canWrite
      ? [
          { to: '/reports/new', label: t('shell.newReport'), section: 'actions', icon: Plus },
          {
            to: '/reports/import',
            label: t('shell.commands.importReport'),
            section: 'actions',
            icon: FileUp,
          },
        ]
      : [];
    return [...actions, ...pages];
  }, [profile, t]);

  const results = useMemo(
    () => entries.filter((e) => fold(e.label).includes(fold(query.trim()))),
    [entries, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // Focus after the dialog paints.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    navigate(e.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Tab') {
      // Single-field dialog: keep focus on the input rather than escaping behind the overlay.
      e.preventDefault();
    }
  };

  const optionId = (i: number) => `cmd-option-${i}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-900/40 px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.commands.title')}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search aria-hidden size={16} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-listbox"
            aria-activedescendant={results[active] ? optionId(active) : undefined}
            aria-label={t('shell.commands.title')}
            placeholder={t('shell.commands.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
        </div>

        <ul id="cmd-listbox" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">
              {t('shell.commands.empty')}
            </li>
          ) : (
            results.map((e, i) => {
              const Icon = e.icon;
              const selected = i === active;
              return (
                <li
                  key={e.to}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e)}
                  className={`flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm ${
                    selected ? 'bg-accent-soft text-navy-800' : 'text-text'
                  }`}
                >
                  <Icon aria-hidden size={16} />
                  <span className="flex-1 truncate">{e.label}</span>
                  {selected && <ArrowRight aria-hidden size={14} className="text-accent" />}
                </li>
              );
            })
          )}
        </ul>

        <div className="flex flex-col gap-0.5 border-t border-border bg-surface-muted px-4 py-2 text-xs text-text-muted sm:flex-row sm:justify-between">
          <span>{t('shell.commands.hint')}</span>
          <span>{t('shell.commands.recordsSoon')}</span>
        </div>
      </div>
    </div>
  );
}
