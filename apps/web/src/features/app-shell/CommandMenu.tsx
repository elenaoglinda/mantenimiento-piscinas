import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileUp, Plus } from 'lucide-react';
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
 * ⌘K palette. Jumps to pages and the two quick actions; searching records (pools, clients,
 * reports) is a follow-up and the palette says so rather than pretending.
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

  const item = (e: Entry) => {
    const Icon = e.icon;
    return (
      // The filter matches the label the user reads, not the URL. Labels are unique.
      <CommandItem key={e.to} value={e.label} onSelect={() => go(e.to)}>
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
          <span>{t('shell.commands.recordsSoon')}</span>
        </>
      }
    >
      <CommandInput
        aria-label={t('shell.commands.title')}
        placeholder={t('shell.commands.placeholder')}
      />
      <CommandList>
        <CommandEmpty>{t('shell.commands.empty')}</CommandEmpty>
        {actions.length > 0 && (
          <CommandGroup heading={t('shell.commands.actions')}>{actions.map(item)}</CommandGroup>
        )}
        <CommandGroup heading={t('shell.commands.pages')}>{pages.map(item)}</CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
