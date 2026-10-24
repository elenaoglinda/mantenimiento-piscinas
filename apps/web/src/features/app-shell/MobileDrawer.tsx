import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sidebar as an off-canvas drawer below 1024px.
 *
 * Behaves as a modal: focus moves in on open and is trapped (Tab wraps), Esc and the backdrop
 * close it, the page behind can't scroll, and focus returns to the menu button on close.
 * Closing on navigation is handled by the shell, which watches the route.
 */
export function MobileDrawer({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const returnTarget = returnFocusTo.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      returnTarget?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <div
      id="mobile-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.mainNav')}
      className="fixed inset-0 z-50 lg:hidden"
    >
      <div aria-hidden className="absolute inset-0 bg-navy-900/40" onClick={onClose} />
      <div ref={panelRef} className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-xl">
        <Sidebar variant="drawer" onClose={onClose} />
      </div>
    </div>
  );
}
