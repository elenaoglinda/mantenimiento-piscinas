import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { Alert } from './ui/feedback.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { TextareaField } from './ui/fields.js';
import { Modal } from './ui/Modal.js';
import type { Tables } from '../lib/database.types.js';

export type Client = Tables<'client'>;

/** Create or edit a client. Used by Clientes ("Nuevo cliente") and the client page ("Editar"). */
export function ClientFormModal({
  client,
  orgId,
  onClose,
  onSaved,
}: {
  client: Client | null;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(client?.name ?? '');
  const [cifNif, setCifNif] = useState(client?.cif_nif ?? '');
  const [email, setEmail] = useState(client?.contact_email ?? '');
  const [phone, setPhone] = useState(client?.contact_phone ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      cif_nif: cifNif.trim() || null,
      contact_email: email.trim() || null,
      contact_phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = client
      ? await supabase.from('client').update(payload).eq('id', client.id)
      : await supabase.from('client').insert({ ...payload, org_id: orgId });
    setSaving(false);
    if (error) {
      setError(t('common.genericError'));
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={client ? t('clients.editClient') : t('clients.addClient')}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label={t('clients.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label={t('clients.cifNif')}
          value={cifNif}
          onChange={(e) => setCifNif(e.target.value)}
        />
        <TextField
          label={t('clients.contactEmail')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('clients.contactPhone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextareaField
          label={t('clients.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
