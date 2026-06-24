import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { TextField } from './ui/TextField.js';
import { Alert } from './ui/feedback.js';
import { SignaturePad } from './SignaturePad.js';

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function SignModal({
  reportId,
  orgId,
  onClose,
  onSigned,
}: {
  reportId: string;
  orgId: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dni, setDni] = useState('');
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!name.trim() || !dni.trim()) {
      setError(t('common.requiredField'));
      return;
    }
    if (!signature) {
      setError(t('sign.needSignature'));
      return;
    }
    setSaving(true);
    setError(null);

    const path = `${orgId}/${reportId}/signature.png`;
    const { error: upErr } = await supabase.storage
      .from('reports')
      .upload(path, dataUrlToBlob(signature), { upsert: true, contentType: 'image/png' });
    if (upErr) {
      setSaving(false);
      setError(t('common.genericError'));
      return;
    }

    const { error: updErr } = await supabase
      .from('report')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_by_name: name.trim(),
        signed_by_dni: dni.trim(),
        signature_path: path,
      })
      .eq('id', reportId);

    setSaving(false);
    if (updErr) {
      setError(t('common.genericError'));
      return;
    }
    onSigned();
  }

  return (
    <Modal open onClose={onClose} title={t('sign.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">{t('sign.intro')}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label={t('sign.signerName')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label={t('sign.signerDni')}
          required
          value={dni}
          onChange={(e) => setDni(e.target.value)}
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-text">{t('sign.drawHint')}</span>
          <SignaturePad onChange={setSignature} />
        </div>
        <p className="text-xs text-text-muted">{t('sign.immutableNote')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={confirm} loading={saving}>
            {t('sign.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
