import type { ReactNode } from 'react';
import { Dialog } from './Dialog.js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** The original modal API, now backed by `Dialog` (focus trap, Esc, focus return). */
export function Modal({ open, onClose, title, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {children}
    </Dialog>
  );
}
