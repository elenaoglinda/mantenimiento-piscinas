import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/feedback.js';
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
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          step.done
            ? 'bg-status-green-bg text-status-green-text'
            : 'border border-border text-text-muted'
        }`}
      >
        {step.done ? '✓' : (index ?? '·')}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${step.done ? 'text-text-muted line-through' : 'text-text'}`}>
          {title}
        </p>
        <p className="text-sm text-text-muted">{desc}</p>
      </div>
      {!step.done && (
        <div className="ml-9 flex items-center gap-3 sm:ml-0">
          <Link to={step.to} className="text-sm font-medium text-text-muted hover:text-text">
            {t('checklist.howTo')}
          </Link>
          <Link
            to={step.to}
            className="inline-flex items-center rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-sm font-semibold text-primary-contrast transition-colors hover:bg-primary-hover"
          >
            {t(`checklist.steps.${step.key}.cta`)}
          </Link>
        </div>
      )}
    </li>
  );
}

export function OnboardingChecklist({ checklist, onDismiss }: OnboardingChecklistProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text">{t('checklist.title')}</h2>
          <p className="text-sm text-text-muted">{t('checklist.subtitle')}</p>
        </div>
        <span className="rounded-[var(--radius-full)] bg-surface-muted px-3 py-1 text-sm font-semibold text-text">
          {checklist.doneCount}/{checklist.total}
        </span>
      </div>

      <ol className="mt-3 divide-y divide-border">
        {checklist.primary.map((step, i) => (
          <StepRow key={step.key} step={step} index={i + 1} />
        ))}
      </ol>

      {checklist.secondary.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text-muted">{t('checklist.optionalTitle')}</h3>
          <ul className="mt-1 divide-y divide-border">
            {checklist.secondary.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 text-right">
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm font-medium text-text-muted hover:text-text hover:underline"
        >
          {t('checklist.skip')}
        </button>
      </div>
    </Card>
  );
}
