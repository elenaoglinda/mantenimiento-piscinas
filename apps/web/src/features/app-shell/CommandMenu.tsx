import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, FileUp, Plus, Users, Waves } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../auth/context.js';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../components/ui/Command.js';
import { UTILITY_PAGES, visibleGroups } from './nav.js';

/**
 * ⌘K palette: pages, quick actions, and — from two letters on — pools and clients by name, plus
 * "search this in Informes". Record lookups are read-only `ilike` queries on existing tables.
 */
interface Entry {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<{ pools: Entry[]; clients: Entry[] }>({
    pools: [],
    clients: [],
  });
  const isCompany = profile?.org.type === 'company';

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    // Wildcards typed by the user are matched literally.
    const q = search.trim().replace(/[%_]/g, '');
    if (q.length < 2) {
      setRecords({ pools: [], clients: [] });
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const [pools, clients] = await Promise.all([
          supabase
            .from('pool')
            .select('id, denominacion')
            .eq('archived', false)
            .ilike('denominacion', `%${q}%`)
            .limit(6),
          isCompany
            ? supabase
                .from('client')
                .select('id, name')
                .eq('archived', false)
                .eq('is_self', false)
                .ilike('name', `%${q}%`)
                .limit(6)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        if (!active) return;
        setRecords({
          pools: (pools.data ?? []).map((p) => ({
            to: `/pools/${p.id}`,
            label: p.denominacion,
            icon: Waves,
          })),
          clients: (clients.data ?? []).map((c) => ({
            to: `/clients?q=${encodeURIComponent(c.name)}`,
            label: c.name,
            icon: Users,
          })),
        });
      } catch {
        // Offline or a failed query: the palette keeps working with pages only.
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, isCompany]);

  const { actions, pages } = useMemo(() => {
    const pages: Entry[] = [
      ...visibleGroups(profile?.org.type).flatMap((g) => g.items),
      ...UTILITY_PAGES,
    ].map((i) => ({ to: i.to, label: t(i.labelKey), icon: i.icon }));
    const canWrite = profile ? profile.user.role !== 'viewer' : false;
    const actions: Entry[] = canWrite
      ? [
          { to: '/reports/new', label: t('shell.newReport'), icon: Plus },
          { to: '/reports/import', label: t('shell.commands.importReport'), icon: FileUp },
        ]
      : [];
    return { actions, pages };
  }, [profile, t]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const item = (e: Entry, alwaysShow = false) => {
    const Icon = e.icon;
    return (
      // The filter matches the label the user reads, not the URL. Records were already filtered
      // by the server, so they carry the query as a keyword to stay visible.
      <CommandItem
        key={e.to}
        value={`${e.label}${alwaysShow ? ` ${e.to}` : ''}`}
        keywords={alwaysShow ? [search] : undefined}
        onSelect={() => go(e.to)}
      >
        <Icon aria-hidden size={16} />
        <span className="flex-1 truncate">{e.label}</span>
      </CommandItem>
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      label={t('shell.commands.title')}
      footer={
        <>
          <span>{t('shell.commands.hint')}</span>
          <span>{t('shell.commands.recordsHint')}</span>
        </>
      }
    >
      <CommandInput
        aria-label={t('shell.commands.title')}
        placeholder={t('shell.commands.placeholder')}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{t('shell.commands.empty')}</CommandEmpty>
        {actions.length > 0 && (
          <CommandGroup heading={t('shell.commands.actions')}>
            {actions.map((e) => item(e))}
          </CommandGroup>
        )}
        <CommandGroup heading={t('shell.commands.pages')}>{pages.map((e) => item(e))}</CommandGroup>
        {records.pools.length > 0 && (
          <CommandGroup heading={t('nav.pools')}>
            {records.pools.map((e) => item(e, true))}
          </CommandGroup>
        )}
        {records.clients.length > 0 && (
          <CommandGroup heading={t('nav.clients')}>
            {records.clients.map((e) => item(e, true))}
          </CommandGroup>
        )}
        {search.trim().length >= 2 && (
          <CommandGroup heading={t('nav.reports')}>
            {item(
              {
                to: `/reports?q=${encodeURIComponent(search.trim())}`,
                label: t('shell.commands.searchReports', { q: search.trim() }),
                icon: ClipboardList,
              },
              true,
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
