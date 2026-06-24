import { useTranslation } from 'react-i18next';
import { evaluate, type ParameterDef } from '@piscinas/shared';

// Demo definition (pH per RD 742/2013) to exercise the shared evaluation engine in Phase 0.
const pH: ParameterDef = { minOk: 7.2, maxOk: 8.0, closureMin: 6.0, closureMax: 9.0 };

const statusStyles: Record<string, string> = {
  green: 'bg-status-green-bg text-status-green',
  amber: 'bg-status-amber-bg text-status-amber',
  red: 'bg-status-red-bg text-status-red',
  unknown: 'bg-status-unknown-bg text-status-unknown',
};

export function App() {
  const { t } = useTranslation();
  const samples = [6.8, 7.3, 7.6, 8.4];

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-5 py-12">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-medium text-primary">{t('app.name')}</span>
        <h1 className="text-2xl font-semibold text-text">{t('phase0.ready')}</h1>
        <p className="text-text-muted">{t('phase0.description')}</p>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">pH — RD 742/2013 (7.2–8.0)</h2>
        <ul className="flex flex-col gap-2">
          {samples.map((value) => {
            const { status } = evaluate(value, pH);
            return (
              <li key={value} className="flex items-center justify-between">
                <span className="font-mono text-text">pH {value.toFixed(1)}</span>
                <span
                  className={`rounded-[var(--radius-full)] px-3 py-1 text-sm font-medium ${statusStyles[status]}`}
                >
                  {t(`status.${status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
