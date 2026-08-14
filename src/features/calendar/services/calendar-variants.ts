/**
 * Teacher-readable selectable calendar variants.
 * Writes are validated here; semester_plans RLS remains the ownership boundary.
 */

import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import { GENERAL_VARIANT_CODE } from "./resolve-calendar.ts";
import {
  assertSelectableCalendarVariant,
  type SelectableCalendarVariant,
} from "./calendar-variant-selection.ts";

type Client = NonNullable<SupabaseUserContext>["client"];

function mapVariant(row: {
  id: string;
  code: string;
  label: string;
  is_selectable: boolean;
}): SelectableCalendarVariant {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isSelectable: row.is_selectable,
  };
}

export async function listSelectableCalendarVariants(
  context?: SupabaseUserContext,
): Promise<SelectableCalendarVariant[]> {
  const resolved = await resolveUserContext(context);
  if (!resolved) return [];

  const { data, error } = await resolved.client
    .from("calendar_variants")
    .select("id, code, label, is_selectable, sort_order")
    .eq("is_selectable", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapVariant);
}

export async function resolveSelectableVariantForWrite(
  client: Client,
  input?: { id?: string | null; code?: string | null },
): Promise<SelectableCalendarVariant> {
  let query = client.from("calendar_variants").select("id, code, label, is_selectable");

  if (input?.id) {
    query = query.eq("id", input.id);
  } else {
    query = query.eq("code", input?.code || GENERAL_VARIANT_CODE);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return assertSelectableCalendarVariant(data ? mapVariant(data) : null);
}
