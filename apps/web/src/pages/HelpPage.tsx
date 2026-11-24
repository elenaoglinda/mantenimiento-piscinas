import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, ExternalLink, LifeBuoy, Search } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Input } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { cn, focusRing, fold } from '../components/ui/utils.js';

interface Item {
  q: string;
  a: string;
}

const SECTIONS = ['start', 'reports', 'siloe', 'routes', 'invoicing', 'team'] as const;

/** Ayuda: short answers per area, searchable, accent-insensitive. Copy lives in common.json. */
export function HelpPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = fold(query.trim());
    return SECTIONS.map((key) => ({
      key,
      title: t(`help.sections.${key}.title`),
      items: (t(`help.sections.${key}.items`, { returnObjects: true }) as Item[]).filter(
        (i) => !q || fold(`${i.q} ${i.a}`).includes(q),
      ),
    })).filter((s) => s.items.length > 0);
  }, [query, t]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="mb-0" title={t('shell.help')} description={t('help.subtitle')} />

      <div className="relative max-w-md">
        <Search
          aria-hidden
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.search')}
          aria-label={t('help.search')}
          className="pl-9"
        />
      </div>

      {sections.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Search size={20} />}
            title={t('help.noResults')}
            description={t('help.noResultsHint')}
          />
        </Card>
      ) : (
        sections.map((s) => (
          <section key={s.key} aria-labelledby={`help-${s.key}`}>
            <h2 id={`help-${s.key}`} className="mb-3 text-base font-semibold text-text">
              {s.title}
            </h2>
            <Card padded={false}>
              <ul>
                {s.items.map((item) => (
                  <li key={item.q} className="border-b border-border last:border-0">
                    <Collapsible.Root defaultOpen={Boolean(query.trim())}>
                      <Collapsible.Trigger
                        className={cn(
                          'group flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-medium text-text hover:bg-surface-muted/60 sm:px-6',
                          focusRing,
                        )}
                      >
                        {item.q}
                        <ChevronDown
                          aria-hidden
                          size={16}
                          className="shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-180"
                        />
                      </Collapsible.Trigger>
                      <Collapsible.Content className="px-5 pb-4 text-sm leading-6 text-text-muted sm:px-6">
                        {item.a}
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}

      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        >
          <LifeBuoy size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">{t('help.moreTitle')}</p>
          <p className="text-sm text-text-muted">{t('help.moreBody')}</p>
        </div>
        <Button asChild variant="secondary">
          <a href="https://meetloro.com" target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden size={16} />
            {t('help.moreAction')}
          </a>
        </Button>
      </Card>
    </div>
  );
}
