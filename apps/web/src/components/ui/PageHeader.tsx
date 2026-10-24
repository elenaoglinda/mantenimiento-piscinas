import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from './utils.js';

/**
 * The top of every page: optional back link, title (24/32), one line of description, status
 * badges next to the title, actions on the right, and tabs underneath.
 *
 *   <PageHeader title="Piscinas" description="Instalaciones que gestionas."
 *     actions={<Button>Nueva piscina</Button>} />
 */
export function PageHeader({
  title,
  description,
  back,
  badges,
  actions,
  tabs,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { to: string; label: ReactNode };
  /** Pills next to the title (status, "Entorno de pruebas"). */
  badges?: ReactNode;
  actions?: ReactNode;
  /** A `TabsNav` or `TabsList`, rendered full width below. */
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {back && (
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft aria-hidden size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl leading-8 font-semibold text-text">{title}</h1>
            {badges}
          </div>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-5">{tabs}</div>}
    </header>
  );
}
