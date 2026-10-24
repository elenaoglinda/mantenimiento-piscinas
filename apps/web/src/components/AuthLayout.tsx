import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from './brand/Logo.js';

/** Centered card layout used by the login / sign-up / onboarding screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-5 py-10">
      <div className="mb-6 flex flex-col items-center gap-1 text-center">
        <Logo size="lg" />
        <span className="max-w-xs text-sm text-text-muted">{t('app.tagline')}</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
