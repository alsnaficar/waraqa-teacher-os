/**
 * Pure calendar-variant selection for semester plans.
 * NULL on an existing plan reads as GENERAL and is never backfilled here.
 */

import { GENERAL_VARIANT_CODE, WESTERN_VARIANT_CODE } from "./resolve-calendar.ts";

export const CALENDAR_VARIANT_NOT_FOUND_MESSAGE = "التقويم الدراسي غير موجود.";
export const CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE = "هذا التقويم غير متاح للاختيار.";
export const CALENDAR_VARIANT_UNAUTHORIZED_MESSAGE = "لا يمكنك تعديل تقويم هذه الخطة.";

export interface SelectableCalendarVariant {
  id: string;
  code: string;
  label: string;
  isSelectable: boolean;
}

export function assertSelectableCalendarVariant(
  row: SelectableCalendarVariant | null | undefined,
): SelectableCalendarVariant {
  if (!row) {
    throw new Error(CALENDAR_VARIANT_NOT_FOUND_MESSAGE);
  }
  if (!row.isSelectable) {
    throw new Error(CALENDAR_VARIANT_NOT_SELECTABLE_MESSAGE);
  }
  return row;
}

export function pickVariantForNewPlan(
  catalog: SelectableCalendarVariant[],
  input?: { id?: string | null; code?: string | null },
): SelectableCalendarVariant {
  if (input?.id) {
    return assertSelectableCalendarVariant(catalog.find((row) => row.id === input.id));
  }
  if (input?.code) {
    return assertSelectableCalendarVariant(catalog.find((row) => row.code === input.code));
  }
  return assertSelectableCalendarVariant(catalog.find((row) => row.code === GENERAL_VARIANT_CODE));
}

export function readPlanVariantCode(
  plan: { calendar_variant_id?: string | null },
  catalog: SelectableCalendarVariant[],
): string {
  if (!plan.calendar_variant_id) return GENERAL_VARIANT_CODE;
  return catalog.find((row) => row.id === plan.calendar_variant_id)?.code ?? GENERAL_VARIANT_CODE;
}

export function displayedCalendarVariantId(
  calendarVariantId: string | null | undefined,
  generalId: string,
): string {
  return calendarVariantId ?? generalId;
}

/**
 * NULL legacy plans display as GENERAL. Selecting GENERAL must not write.
 * An explicit change to WESTERN (or away from WESTERN) does persist.
 */
export function shouldPersistPlanVariantChange(
  currentId: string | null | undefined,
  nextId: string,
  generalId: string,
): boolean {
  if (!nextId || currentId === nextId) return false;
  if (currentId == null && nextId === generalId) return false;
  return true;
}

export function isKnownCalendarVariantCode(code: string): boolean {
  return code === GENERAL_VARIANT_CODE || code === WESTERN_VARIANT_CODE;
}
