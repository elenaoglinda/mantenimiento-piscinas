import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus } from 'lucide-react';
import {
  CHEMICAL_UNITS,
  formatQuantity,
  parseQuantity,
  type ChemicalProduct,
  type ChemicalUnit,
} from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Field, Input, NativeSelect } from '../../../components/ui/Input.js';
import { Modal } from '../../../components/ui/Modal.js';
import { SkeletonText } from '../../../components/ui/Skeleton.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { toast } from '../../../components/ui/toast.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { createProduct, fetchProducts, updateProduct } from '../lib/data.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

/**
 * Ajustes → Productos: the org's product catalogue (admins). A product that was ever used
 * can't be deleted, so the list offers "Desactivar": it disappears from the quick-pick chips
 * but stays in every visit that logged it.
 */
export function ProductCatalogueSettings({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ChemicalProduct[] | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [editing, setEditing] = useState<ChemicalProduct | 'new' | null>(null);

  const load = useCallback(async () => {
    const r = await fetchProducts();
    setProducts(r.data);
    setFailure(r.failure);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(p: ChemicalProduct) {
    const f = await updateProduct(p.id, { activo: !p.activo });
    if (f) setFailure(f);
    else void load();
  }

  return (
    <Card padded={false}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardHeader
          title={t('serviceLog.products.catalogueTitle')}
          description={t('serviceLog.products.catalogueHint')}
          actions={
            !failure && (
              <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
                <Plus aria-hidden size={14} />
                {t('serviceLog.products.add')}
              </Button>
            )
          }
        />
      </div>
      {failure ? (
        <div className="px-5 pb-5 sm:px-6">
          <ServiceLogAlert failure={failure} />
        </div>
      ) : !products ? (
        <div className="px-5 pb-5 sm:px-6">
          <SkeletonText lines={3} />
        </div>
      ) : (
        <ul aria-label={t('serviceLog.products.catalogueTitle')}>
          {products.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5 sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={p.activo ? 'font-medium text-text' : 'font-medium text-text-muted'}
                >
                  {p.nombre}
                </span>
                <span className="block text-xs text-text-muted">
                  {p.cantidadHabitual != null
                    ? t('serviceLog.products.usual', {
                        amount: formatQuantity(p.cantidadHabitual, p.unidad),
                      })
                    : p.unidad}
                </span>
              </span>
              {!p.activo && (
                <StatusPill tone="neutral" dot={false}>
                  {t('serviceLog.inactive')}
                </StatusPill>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${t('common.edit')}: ${p.nombre}`}
                onClick={() => setEditing(p)}
              >
                <Pencil aria-hidden size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                // Visible text first, so the spoken name starts with what's on screen.
                aria-label={`${p.activo ? t('serviceLog.deactivate') : t('serviceLog.activate')}: ${p.nombre}`}
                onClick={() => void toggle(p)}
              >
                {p.activo ? t('serviceLog.deactivate') : t('serviceLog.activate')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ProductModal
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            const f =
              editing === 'new'
                ? await createProduct(orgId, { ...v, orden: (products?.length ?? 0) + 1 })
                : await updateProduct(editing.id, v);
            if (f) return f;
            setEditing(null);
            toast(t('settings.saved'));
            void load();
            return null;
          }}
        />
      )}
    </Card>
  );
}

function ProductModal({
  product,
  onClose,
  onSave,
}: {
  product: ChemicalProduct | null;
  onClose: () => void;
  onSave: (v: {
    nombre: string;
    unidad: ChemicalUnit;
    cantidadHabitual: number | null;
  }) => Promise<DbFailure | null>;
}) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState(product?.nombre ?? '');
  const [unidad, setUnidad] = useState<ChemicalUnit>(product?.unidad ?? 'kg');
  const [cantidad, setCantidad] = useState(
    product?.cantidadHabitual != null ? String(product.cantidadHabitual).replace('.', ',') : '',
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const qty = cantidad.trim() ? parseQuantity(cantidad) : null;
  const qtyInvalid = cantidad.trim() !== '' && qty == null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || qtyInvalid) return;
    setSaving(true);
    setFailure(await onSave({ nombre, unidad, cantidadHabitual: qty }));
    setSaving(false);
  }

  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={product ? t('serviceLog.products.edit') : t('serviceLog.products.add')}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ServiceLogAlert failure={failure} />
        <Field label={t('serviceLog.name')}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </Field>
        <Field label={t('serviceLog.products.unit')}>
          <NativeSelect value={unidad} onChange={(e) => setUnidad(e.target.value as ChemicalUnit)}>
            {CHEMICAL_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={t('serviceLog.products.usualQuantity')}
          hint={t('serviceLog.products.usualHint')}
          error={qtyInvalid ? t('serviceLog.products.quantityRequired') : undefined}
        >
          <Input
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={!nombre.trim() || qtyInvalid}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
