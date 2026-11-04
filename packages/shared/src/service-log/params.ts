/**
 * Readings outside SILOE (alkalinity, calcium hardness, salt, phosphates). Their parameter_def
 * rows have no SILOE id (in_siloe = false) and a `clave` instead.
 *
 * The app keys every parameter by a number: the SILOE id (1–16) for SILOE parameters, and a
 * fixed key from 101 up for the others, so history, trends and CSV columns can treat both
 * alike without ever mistaking one for a SILOE parameter. Keys never collide: SILOE ids are
 * below 100.
 */
export const EXTRA_PARAM_KEYS: Readonly<Record<string, number>> = {
  alcalinidad_total: 101,
  dureza_calcica: 102,
  sal: 103,
  fosfatos: 104,
};

/** Keys at or above this are parameters outside SILOE. */
export const EXTRA_KEY_BASE = 100;

export interface ParamIdentity {
  siloe_param_id: number | null;
  /** Absent on rows read before the migration that adds it: those are all SILOE. */
  in_siloe?: boolean | null;
  clave?: string | null;
}

/** True for a parameter that belongs in SILOE (aggregation, XML, photo import). */
export function isSiloeParameter(def: ParamIdentity): boolean {
  return def.siloe_param_id != null && def.in_siloe !== false;
}

/** The app-wide key of a parameter; null for an unknown parameter outside SILOE (ignored). */
export function paramKey(def: ParamIdentity): number | null {
  if (isSiloeParameter(def)) return def.siloe_param_id;
  return (def.clave && EXTRA_PARAM_KEYS[def.clave]) || null;
}

/** True for a key of a parameter outside SILOE ("recomendado", not "legal"). */
export function isExtraParamKey(key: number): boolean {
  return key > EXTRA_KEY_BASE;
}
