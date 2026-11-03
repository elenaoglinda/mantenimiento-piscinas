/**
 * Products added at a visit: the quick-pick state of the report form and the rows it saves.
 * Quantities are typed by hand on a phone, so they arrive as text in Spanish ("0,5").
 */

/** Units a product can be measured in (DB enum chemical_unit). */
export const CHEMICAL_UNITS = ['kg', 'g', 'L', 'ml', 'pastillas', 'uds'] as const;
export type ChemicalUnit = (typeof CHEMICAL_UNITS)[number];

export interface ChemicalProduct {
  id: string;
  nombre: string;
  unidad: ChemicalUnit;
  cantidadHabitual: number | null;
  activo: boolean;
}

/** One product on the form: quantity as the user typed it. */
export interface ChemicalEntry {
  productId: string;
  cantidad: string;
  unidad: ChemicalUnit;
}

const decimal = /* @__PURE__ */ new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 3,
  useGrouping: false,
});

/** "0,5" / "0.5" / " 2 " → 0.5 / 0.5 / 2. Empty, zero, negative or not a number → null. */
export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

/** 0.5, 'kg' → "0,5 kg"; 2, 'pastillas' → "2 pastillas"; 1, 'pastillas' → "1 pastilla". */
export function formatQuantity(n: number, unit: ChemicalUnit): string {
  return `${decimal.format(n)} ${n === 1 && unit === 'pastillas' ? 'pastilla' : unit}`;
}

/** Tap a quick-pick chip: adds the product (with its usual quantity), or does nothing if present. */
export function addProduct(entries: readonly ChemicalEntry[], p: ChemicalProduct): ChemicalEntry[] {
  if (entries.some((e) => e.productId === p.id)) return [...entries];
  return [
    ...entries,
    {
      productId: p.id,
      cantidad: p.cantidadHabitual != null ? decimal.format(p.cantidadHabitual) : '',
      unidad: p.unidad,
    },
  ];
}

export function removeProduct(
  entries: readonly ChemicalEntry[],
  productId: string,
): ChemicalEntry[] {
  return entries.filter((e) => e.productId !== productId);
}

export function setQuantity(
  entries: readonly ChemicalEntry[],
  productId: string,
  cantidad: string,
): ChemicalEntry[] {
  return entries.map((e) => (e.productId === productId ? { ...e, cantidad } : e));
}

/**
 * The rows to save, or the products whose quantity is missing or invalid. Nothing is saved
 * with a guessed quantity: a product in the list must have a real amount.
 */
export function chemicalRows(entries: readonly ChemicalEntry[]): {
  rows: { product_id: string; cantidad: number; unidad: ChemicalUnit }[];
  invalid: string[];
} {
  const rows: { product_id: string; cantidad: number; unidad: ChemicalUnit }[] = [];
  const invalid: string[] = [];
  for (const e of entries) {
    const n = parseQuantity(e.cantidad);
    if (n == null) invalid.push(e.productId);
    else rows.push({ product_id: e.productId, cantidad: n, unidad: e.unidad });
  }
  return { rows, invalid };
}

/** Saved rows back into form entries (editing a report). */
export function entriesFromRows(
  rows: readonly { product_id: string; cantidad: number; unidad: ChemicalUnit }[],
): ChemicalEntry[] {
  return rows.map((r) => ({
    productId: r.product_id,
    cantidad: decimal.format(r.cantidad),
    unidad: r.unidad,
  }));
}
