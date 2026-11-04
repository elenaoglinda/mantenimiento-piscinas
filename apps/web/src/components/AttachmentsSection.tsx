import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { Card } from './ui/feedback.js';
import type { Enums, Tables } from '../lib/database.types.js';
import { savePhotoThumbnail, thumbnailPath } from '../features/client-reports/index.js';

type Attachment = Tables<'attachment'>;
type Kind = Enums<'attachment_kind'>;

interface Resolved extends Attachment {
  url: string | null;
}

export function AttachmentsSection({
  reportId,
  orgId,
  editable,
}: {
  reportId: string;
  orgId: string;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Resolved[]>([]);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('attachment').select('*').eq('report_id', reportId);
    const resolved = await Promise.all(
      (data ?? []).map(async (a) => {
        const { data: signed } = await supabase.storage
          .from('reports')
          .createSignedUrl(a.storage_path, 3600);
        return { ...a, url: signed?.signedUrl ?? null };
      }),
    );
    setItems(resolved);
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File, kind: Kind) {
    setUploading(true);
    const path = `${orgId}/${reportId}/${kind}-${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('reports').upload(path, file);
    if (!upErr) {
      // Small copy for the client PDFs; the photo itself is saved either way.
      if (kind === 'photo') await savePhotoThumbnail(path, file);
      await supabase
        .from('attachment')
        .insert({ org_id: orgId, report_id: reportId, kind, storage_path: path });
      await load();
    }
    setUploading(false);
  }

  async function remove(item: Resolved) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await supabase.storage
      .from('reports')
      .remove(
        item.kind === 'photo'
          ? [item.storage_path, thumbnailPath(item.storage_path)]
          : [item.storage_path],
      );
    await supabase.from('attachment').delete().eq('id', item.id);
    await load();
  }

  if (!editable && items.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">{t('reports.attachments')}</h2>
        {editable && (
          <div className="flex gap-3 text-sm font-medium text-accent">
            <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading}>
              {t('reports.addPhoto')}
            </button>
            <button type="button" onClick={() => pdfInput.current?.click()} disabled={uploading}>
              {t('reports.addLabPdf')}
            </button>
          </div>
        )}
      </div>
      {uploading && <p className="text-sm text-text-muted">{t('reports.uploading')}</p>}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'photo')}
      />
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'lab_pdf')}
      />

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('common.none')}</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col items-center gap-1">
              {a.kind === 'photo' && a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer">
                  <img
                    src={a.url}
                    alt="foto"
                    className="size-24 rounded-[var(--radius-md)] border border-border object-cover"
                  />
                </a>
              ) : (
                <a
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-24 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-muted text-xs text-accent"
                >
                  PDF
                </a>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="text-xs text-text-muted hover:text-text"
                >
                  {t('common.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
