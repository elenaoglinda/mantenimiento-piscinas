import { supabase } from '../../../lib/supabase.js';
import { toDbFailure, type DbFailure } from '../../../lib/dbError.js';

export interface ClientContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** The contact of the client a pool belongs to: where the e-mail and WhatsApp go. */
export async function fetchPoolClientContact(
  poolId: string,
): Promise<{ data: ClientContact | null; failure: DbFailure | null }> {
  const { data, error } = await supabase
    .from('pool')
    .select('client!pool_client_id_org_id_fkey(name, contact_email, contact_phone)')
    .eq('id', poolId)
    .maybeSingle();
  if (error) return { data: null, failure: toDbFailure(error) };
  const c = data?.client;
  return {
    failure: null,
    data: c ? { name: c.name, email: c.contact_email, phone: c.contact_phone } : null,
  };
}
