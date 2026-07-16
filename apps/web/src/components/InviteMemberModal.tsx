import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/context.js';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { SelectField } from './ui/fields.js';
import { Alert } from './ui/feedback.js';
import { CopyLinkField } from './ui/CopyLinkField.js';
import { buildInviteUrl, newInviteToken } from '../lib/invitations.js';
import type { Enums } from '../lib/database.types.js';

type Role = Enums<'user_role'>;
const ROLES: Role[] = ['technician', 'viewer', 'admin'];

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful invite so the parent can refresh the pending list. */
  onCreated: () => void;
}

export function InviteMemberModal({ open, onClose, onCreated }: InviteMemberModalProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('technician');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setRole('technician');
    setError(null);
    setCreatedUrl(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    const token = newInviteToken();
    const { error } = await supabase.from('invitation').insert({
      org_id: profile.org.id,
      email: email.trim(),
      role,
      token,
    });
    setSubmitting(false);
    if (error) {
      setError(error.code === '23505' ? t('invitations.duplicate') : t('common.genericError'));
      return;
    }
    setCreatedUrl(buildInviteUrl(token));
    onCreated();
  }

  return (
    <Modal open={open} onClose={close} title={t('invitations.inviteTitle')}>
      {createdUrl ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{t('invitations.created', { email })}</Alert>
          <CopyLinkField url={createdUrl} />
          <p className="text-sm text-text-muted">{t('invitations.shareHint')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>
              {t('invitations.inviteAnother')}
            </Button>
            <Button onClick={close}>{t('invitations.done')}</Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label={t('auth.email')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint={t('invitations.emailHint')}
          />
          <SelectField
            label={t('team.columnRole')}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={submitting}>
              {t('invitations.sendInvite')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
