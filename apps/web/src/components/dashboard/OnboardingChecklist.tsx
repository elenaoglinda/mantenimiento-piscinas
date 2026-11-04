import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Collapsible from '@radix-ui/react-collapsible';
import { Check, ChevronDown } from 'lucide-react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';
import { ProgressBar } from '../ui/ProgressBar.js';
import { cn } from '../ui/utils.js';
import type { Checklist, ChecklistStep } from '../../lib/dashboard.js';

interface OnboardingChecklistProps {
  checklist: Checklist;
  onDismiss: () => void;
}

function StepRow({ step, index }: { step: ChecklistStep; index?: number }) {
  const { t } = useTranslation();
  const title = t(`checklist.steps.${step.key}.title`);
  const desc = t(`checklist.steps.${step.key}.desc`);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          step.done
            ? 'bg-status-green-bg text-status-green-text'
            : 'border border-border text-text-muted',
        )}
      >
        {step.done ? <Check size={14} /> : (index ?? '·')}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', step.done ? 'text-text-muted line-through' : 'text-text')}>
          {title}
        </p>
        <p className="text-sm text-text-muted">{desc}</p>
      </div>
      {!step.done && (
        <Button asChild variant="secondary" size="sm" className="ml-9 sm:ml-0">
          <Link to={step.to}>{t(`checklist.steps.${step.key}.cta`)}</Link>
        </Button>
      )}
    </li>
  );
}

/**
 * "Primeros pasos", compact: progress and the next step on one row; the full list expands
 * underneath. Hidden by the page once every step is done or it's dismissed.
 */
export function OnboardingChecklist({ checklist, onDismiss }: OnboardingChecklistProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const next = checklist.primary.find((s) => !s.done) ?? checklist.secondary.find((s) => !s.done);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} asChild>
      <Card padded={false}>
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:w-72">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-text">{t('checklist.title')}</h2>
              <span className="text-sm font-semibold text-text tabular-nums">
                {checklist.doneCount}/{checklist.total}
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              value={checklist.doneCount}
              max={checklist.total}
              label={t('checklist.title')}
            />
          </div>

          {next && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 lg:border-l lg:border-border lg:pl-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-muted">{t('checklist.next')}</p>
                <p className="truncate font-medium text-text">
                  {t(`checklist.steps.${next.key}.title`)}
                </p>
              </div>
              <Button asChild size="sm">
                <Link to={next.to}>{t(`checklist.steps.${next.key}.cta`)}</Link>
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Collapsible.Trigger asChild>
              <Button variant="ghost" size="sm">
                {open ? t('checklist.hideSteps') : t('checklist.showSteps')}
                <ChevronDown
                  aria-hidden
                  size={16}
                  className={cn('transition-transform', open && 'rotate-180')}
                />
              </Button>
            </Collapsible.Trigger>
            <Button variant="ghost" size="sm" type="button" onClick={onDismiss}>
              {t('checklist.skip')}
            </Button>
          </div>
        </div>

        <Collapsible.Content className="border-t border-border px-5 pb-4">
          <p className="pt-3 text-sm text-text-muted">{t('checklist.subtitle')}</p>
          <ol className="divide-y divide-border">
            {checklist.primary.map((step, i) => (
              <StepRow key={step.key} step={step} index={i + 1} />
            ))}
          </ol>
          {checklist.secondary.length > 0 && (
            <div className="mt-2 border-t border-border pt-3">
              <h3 className="text-sm font-semibold text-text-muted">
                {t('checklist.optionalTitle')}
              </h3>
              <ul className="divide-y divide-border">
                {checklist.secondary.map((step) => (
                  <StepRow key={step.key} step={step} />
                ))}
              </ul>
            </div>
          )}
        </Collapsible.Content>
      </Card>
    </Collapsible.Root>
  );
}
