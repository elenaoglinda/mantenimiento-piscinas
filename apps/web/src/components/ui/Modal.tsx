import type { ReactNode } from 'react';
import { Dialog, Sheet } from './Dialog.js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `sheet` slides in from the right — for longer create/edit forms. */
  variant?: 'dialog' | 'sheet';
  children: ReactNode;
}

/** The original modal API, now backed by `Dialog`/`Sheet` (focus trap, Esc, focus return). */
export function Modal({ open, onClose, title, variant = 'dialog', children }: ModalProps) {
  const Container = variant === 'sheet' ? Sheet : Dialog;
  return (
    <Container open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {children}
    </Container>
  );
}
