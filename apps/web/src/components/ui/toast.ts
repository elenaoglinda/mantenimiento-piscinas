export type ToastTone = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

// A tiny module-level store so any code (not just components) can raise a toast. `Toaster`
// (Toast.tsx) renders it.
const listeners = new Set<() => void>();
let items: ToastItem[] = [];
let nextId = 1;
const emit = () => listeners.forEach((l) => l());

export const getToasts = () => items;

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Show a toast: `toast('Piscina creada')` or `toast('No se pudo guardar', { tone: 'error' })`. */
export function toast(title: string, opts: { description?: string; tone?: ToastTone } = {}) {
  items = [
    ...items,
    { id: nextId++, title, description: opts.description, tone: opts.tone ?? 'success' },
  ];
  emit();
}

export function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}
