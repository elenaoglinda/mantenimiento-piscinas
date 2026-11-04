import { useLayoutEffect, useRef } from 'react';

/**
 * Put focus back where it was when the dialog opened. Radix does this when it closes a dialog
 * itself, but many pages unmount theirs outright (`{open && <Modal …/>}`), which skips that and
 * drops focus on <body>. Captured in a layout effect, before Radix moves focus inside.
 */
export function useReturnFocus(open: boolean) {
  const prev = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = prev.current;
      setTimeout(() => {
        const lost = !document.activeElement || document.activeElement === document.body;
        if (el?.isConnected && lost) el.focus();
      });
    };
  }, [open]);
}
