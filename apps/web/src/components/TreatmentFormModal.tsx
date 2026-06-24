import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { SelectField, TextareaField } from './ui/fields.js';
import { Alert } from './ui/feedback.js';
import type { Enums, Tables } from '../lib/database.types.js';

type Treatment = Tables<'treatment'>;
type TreatmentKind = Enums<'treatment_kind'>;

const KINDS: TreatmentKind[] = [
  'filtracion',
  'desinfeccion',
  'coagulacion',
  'correccion_ph',
  'otros',
];

export function TreatmentFormModal({
  treatment,
  basinId,
  orgId,
  onClose,
  onSaved,
}: {
  treatment: Treatment | null;
  basinId: string;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TreatmentKind>(treatment?.kind ?? 'desinfeccion');
  const [comercial, setComercial] = useState(treatment?.comercial ?? '');
  const [observaciones, setObservaciones] = useState(treatment?.observaciones ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      kind,
      comercial: comercial.trim() || null,
      observaciones: observaciones.trim() || null,
    };
    const { error } = treatment
      ? await supabase.from('treatment').update(payload).eq('id', treatment.id)
      : await supabase.from('treatment').insert({ ...payload, basin_id: basinId, org_id: orgId });
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
      onClose={onClose}
      title={treatment ? t('treatments.editTreatment') : t('treatments.addTreatment')}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="error">{error}</Alert>}
        <SelectField
          label={t('treatments.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as TreatmentKind)}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`treatmentKind.${k}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('treatments.comercial')}
          value={comercial}
          onChange={(e) => setComercial(e.target.value)}
        />
        <TextareaField
          label={t('treatments.observaciones')}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
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
