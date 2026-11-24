import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react';
import { Logo } from './brand/Logo.js';

/**
 * Login / sign-up / onboarding / invite: the form on the right, and from 1024px a brand panel on
 * the left with the same clear-water gradient as the meetloro.com hero. Phones get the form only,
 * with the logo above it.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const points = [t('auth.panel.point1'), t('auth.panel.point2'), t('auth.panel.point3')];

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="relative hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,var(--hero-from)_0%,var(--hero-via)_55%,var(--hero-to)_100%)] p-12 lg:flex">
        <Logo size="lg" />

        <div className="relative z-10 max-w-md">
          {/* A paragraph, not a heading: the page's h1 is the form title. */}
          <p className="font-display text-[32px] leading-10 font-semibold text-navy-900">
            {t('app.tagline')}
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-base text-navy-800">
                <CircleCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-navy-700">{t('auth.panel.footer')}</p>

        {/* Water lines, purely decorative. */}
        <svg
          aria-hidden
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full text-brand-300/40"
        >
          <path d="M0 80 Q75 50 150 80 T300 80 T450 80 T600 80 V200 H0 Z" fill="currentColor" />
          <path
            d="M0 120 Q75 95 150 120 T300 120 T450 120 T600 120 V200 H0 Z"
            fill="currentColor"
          />
        </svg>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center gap-2 text-center lg:hidden">
          <Logo size="lg" />
          <span className="max-w-xs text-sm text-text-muted">{t('app.tagline')}</span>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
