import { useCallback, useState } from 'react';

// Kept from the Cloro days on purpose: renaming it would reset everyone's saved choice.
const KEY = 'cloro.sidebar.collapsed';

/**
 * Collapsed/expanded sidebar, remembered per browser.
 *
 * Storage can throw (private mode, blocked site data) or be empty; both fall back to expanded.
 * This is a per-viewer convenience, so losing it is harmless — it must just never crash.
 */
function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(read);
  const set = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Not persisted this time; the in-memory state still works.
    }
  }, []);
  return [collapsed, set];
}
