/**
 * Pure official-calendar import draft + approval validation.
 * No DB, no Gemini, no Hijri-to-Gregorian conversion.
 */

import { GENERAL_VARIANT_CODE, WESTERN_VARIANT_CODE } from "./resolve-calendar.ts";
import { isIsoDate } from "./academic-calendar.logic.ts";

export const CALENDAR_EXCEPTION_KINDS = [
  "holiday",
  "exam",
  "remote",
  "break",
  "teaching_day",
  "non_teaching_day",
] as const;

export type CalendarExceptionKind = (typeof CALENDAR_EXCEPTION_KINDS)[number];

export const CALENDAR_IMPORT_VARIANT_CODES = [GENERAL_VARIANT_CODE, WESTERN_VARIANT_CODE] as const;

export type CalendarImportVariantCode = (typeof CALENDAR_IMPORT_VARIANT_CODES)[number];

export type CalendarImportItemStatus = "ready" | "needs_review" | "duplicate";

export const CALENDAR_IMPORT_KIND_LABELS: Record<CalendarExceptionKind, string> = {
  holiday: "إجازة",
  exam: "اختبار",
  remote: "عن بعد",
  break: "استراحة",
  teaching_day: "يوم دراسي",
  non_teaching_day: "يوم غير دراسي",
};

export const CALENDAR_IMPORT_DUPLICATE_MESSAGE = "هذا الاستثناء موجود مسبقًا.";
export const CALENDAR_IMPORT_MISSING_YEAR_MESSAGE = "تعذر تحديد العام الدراسي.";
export const CALENDAR_IMPORT_MISSING_SEMESTER_MESSAGE = "تعذر تحديد الفصل الدراسي.";
export const CALENDAR_IMPORT_MISSING_VARIANT_MESSAGE = "تعذر تحديد التقويم (المنطقة).";
export const CALENDAR_IMPORT_MISSING_START_MESSAGE = "تعذر تحديد تاريخ بداية الإجازة.";
export const CALENDAR_IMPORT_MISSING_END_MESSAGE = "تعذر تحديد تاريخ نهاية الإجازة.";
export const CALENDAR_IMPORT_INVALID_DATE_MESSAGE = "التاريخ غير صالح.";
export const CALENDAR_IMPORT_END_BEFORE_START_MESSAGE =
  "تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية.";
export const CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE =
  "التاريخ هجري فقط ويحتاج مراجعة. لا يتم التحويل تلقائيًا.";
export const CALENDAR_IMPORT_OUTSIDE_SEMESTER_MESSAGE = "الاستثناء خارج نطاق الفصل الدراسي.";
export const CALENDAR_IMPORT_EMPTY_TITLE_MESSAGE = "اسم الاستثناء مطلوب.";
export const CALENDAR_IMPORT_INVALID_KIND_MESSAGE = "نوع الاستثناء غير مسموح.";
export const CALENDAR_IMPORT_LOW_CONFIDENCE_MESSAGE = "الثقة منخفضة وتحتاج مراجعة.";
export const CALENDAR_IMPORT_NOT_APPROVED_MESSAGE = "لا يُحفظ الاستيراد إلا بعد اعتماد المدير.";

export const CALENDAR_IMPORT_MIN_GREGORIAN_YEAR = 2000;
export const CALENDAR_IMPORT_REVIEW_CONFIDENCE = 0.75;

export interface RawCalendarImportItem {
  kind?: unknown;
  title?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  hijriStart?: unknown;
  hijriEnd?: unknown;
  hijriLabel?: unknown;
  confidence?: unknown;
  notes?: unknown;
}

export interface CalendarImportDraftItem {
  clientId: string;
  kind: CalendarExceptionKind | "";
  title: string;
  startDate: string;
  endDate: string;
  hijriLabel: string;
  confidence: number;
  status: CalendarImportItemStatus;
  reviewReason: string | null;
  selected: boolean;
}

export interface CalendarImportScope {
  academicYearId: string;
  semesterId: string;
  variantCode: CalendarImportVariantCode;
  variantId: string;
  academicYearLabel: string;
  semesterLabel: string;
  variantLabel: string;
  yearStart: string;
  yearEnd: string | null;
  semesterStart: string;
  semesterEnd: string;
}

export interface ExistingCalendarException {
  variantId: string;
  academicYearId: string;
  semesterId: string | null;
  kind: string;
  startDate: string;
  endDate: string;
  title: string;
}

export interface CalendarImportDraft {
  variantCode: CalendarImportVariantCode;
  variantId: string;
  academicYearId: string;
  semesterId: string;
  academicYearLabel: string;
  semesterLabel: string;
  variantLabel: string;
  semesterStart: string;
  semesterEnd: string;
  items: CalendarImportDraftItem[];
}

export interface CalendarImportApprovalItem {
  kind: string;
  title: string;
  startDate: string;
  endDate: string;
  selected?: boolean;
}

export interface ValidatedApprovalRow {
  variant_id: string;
  academic_year_id: string;
  semester_id: string;
  kind: CalendarExceptionKind;
  action: "add";
  starts_at: string;
  ends_at: string;
  title: string;
  is_teaching_day: boolean;
  is_remote: boolean;
}

export type CalendarImportApprovalDecision =
  | { outcome: "insert"; row: ValidatedApprovalRow }
  | { outcome: "duplicate"; title: string; message: string }
  | { outcome: "rejected"; title: string; message: string };

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return Math.min(1, n / 100);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function isCalendarExceptionKind(value: string): value is CalendarExceptionKind {
  return (CALENDAR_EXCEPTION_KINDS as readonly string[]).includes(value);
}

export function isCalendarImportVariantCode(value: string): value is CalendarImportVariantCode {
  return (CALENDAR_IMPORT_VARIANT_CODES as readonly string[]).includes(value);
}

export function normalizeCalendarExceptionTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function calendarExceptionDuplicateKey(input: {
  variantId: string;
  academicYearId: string;
  semesterId: string | null;
  kind: string;
  startDate: string;
  endDate: string;
  title: string;
}): string {
  return [
    input.variantId,
    input.academicYearId,
    input.semesterId ?? "",
    input.kind,
    input.startDate,
    input.endDate,
    normalizeCalendarExceptionTitle(input.title),
  ].join("|");
}

/**
 * Accept only Gregorian ISO dates. Years before 2000 are treated as likely Hijri
 * written in ISO shape — never converted.
 */
export function parseGregorianIsoDate(value: unknown): {
  iso: string | null;
  reason: string | null;
} {
  const raw = asText(value);
  if (!raw) return { iso: null, reason: null };

  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    if (year < CALENDAR_IMPORT_MIN_GREGORIAN_YEAR) {
      return { iso: null, reason: CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE };
    }
    if (!isIsoDate(raw)) {
      return { iso: null, reason: CALENDAR_IMPORT_INVALID_DATE_MESSAGE };
    }
    return { iso: raw, reason: null };
  }

  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (year < CALENDAR_IMPORT_MIN_GREGORIAN_YEAR) {
      return { iso: null, reason: CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE };
    }
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isIsoDate(iso)) {
      return { iso: null, reason: CALENDAR_IMPORT_INVALID_DATE_MESSAGE };
    }
    return { iso, reason: null };
  }

  return { iso: null, reason: CALENDAR_IMPORT_INVALID_DATE_MESSAGE };
}

export function assertCalendarImportScopeInput(input: {
  academicYearId?: string | null;
  semesterId?: string | null;
  variantCode?: string | null;
}): CalendarImportVariantCode {
  if (!input.academicYearId) {
    throw new Error(CALENDAR_IMPORT_MISSING_YEAR_MESSAGE);
  }
  if (!input.semesterId) {
    throw new Error(CALENDAR_IMPORT_MISSING_SEMESTER_MESSAGE);
  }
  if (!input.variantCode || !isCalendarImportVariantCode(input.variantCode)) {
    throw new Error(CALENDAR_IMPORT_MISSING_VARIANT_MESSAGE);
  }
  return input.variantCode;
}

function hasHijriHint(raw: RawCalendarImportItem): boolean {
  return Boolean(asText(raw.hijriStart) || asText(raw.hijriEnd) || asText(raw.hijriLabel));
}

export function evaluateCalendarImportItem(
  raw: RawCalendarImportItem,
  scope: Pick<CalendarImportScope, "semesterStart" | "semesterEnd">,
  clientId: string,
): CalendarImportDraftItem {
  const reasons: string[] = [];
  const kindRaw = asText(raw.kind);
  const kind = isCalendarExceptionKind(kindRaw) ? kindRaw : ("" as const);
  if (!kind) reasons.push(CALENDAR_IMPORT_INVALID_KIND_MESSAGE);

  const title = normalizeCalendarExceptionTitle(asText(raw.title));
  if (!title) reasons.push(CALENDAR_IMPORT_EMPTY_TITLE_MESSAGE);

  const startParsed = parseGregorianIsoDate(raw.startDate);
  const endParsed = parseGregorianIsoDate(raw.endDate);
  const startDate = startParsed.iso ?? "";
  let endDate = endParsed.iso ?? "";

  if (startParsed.reason) reasons.push(startParsed.reason);
  if (endParsed.reason && endParsed.reason !== startParsed.reason) {
    reasons.push(endParsed.reason);
  }

  if (!startDate && !endDate) {
    if (hasHijriHint(raw) || startParsed.reason === CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE) {
      if (!reasons.includes(CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE)) {
        reasons.push(CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE);
      }
    } else if (!startParsed.reason && !endParsed.reason) {
      reasons.push(CALENDAR_IMPORT_MISSING_START_MESSAGE);
      reasons.push(CALENDAR_IMPORT_MISSING_END_MESSAGE);
    }
  } else if (!startDate) {
    if (!startParsed.reason) reasons.push(CALENDAR_IMPORT_MISSING_START_MESSAGE);
  } else if (!endDate) {
    endDate = startDate;
  }

  if (startDate && endDate && startDate > endDate) {
    reasons.push(CALENDAR_IMPORT_END_BEFORE_START_MESSAGE);
  }

  if (
    startDate &&
    endDate &&
    scope.semesterStart &&
    scope.semesterEnd &&
    (startDate < scope.semesterStart || endDate > scope.semesterEnd)
  ) {
    reasons.push(CALENDAR_IMPORT_OUTSIDE_SEMESTER_MESSAGE);
  }

  const confidence = clampConfidence(raw.confidence);
  if (confidence < CALENDAR_IMPORT_REVIEW_CONFIDENCE) {
    reasons.push(CALENDAR_IMPORT_LOW_CONFIDENCE_MESSAGE);
  }

  const hijriLabel = [asText(raw.hijriLabel), asText(raw.hijriStart), asText(raw.hijriEnd)]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" — ");

  const uniqueReasons = [...new Set(reasons)];
  const status: CalendarImportItemStatus = uniqueReasons.length > 0 ? "needs_review" : "ready";

  return {
    clientId,
    kind,
    title,
    startDate,
    endDate,
    hijriLabel,
    confidence,
    status,
    reviewReason: uniqueReasons.join(" ") || null,
    selected: status === "ready",
  };
}

export function reevaluateEditedImportItem(
  item: CalendarImportDraftItem,
  scope: Pick<CalendarImportScope, "semesterStart" | "semesterEnd">,
): CalendarImportDraftItem {
  return evaluateCalendarImportItem(
    {
      kind: item.kind,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      hijriLabel: item.hijriLabel,
      confidence: Math.max(item.confidence, CALENDAR_IMPORT_REVIEW_CONFIDENCE),
    },
    scope,
    item.clientId,
  );
}

export function buildCalendarImportDraft(
  scope: CalendarImportScope,
  rawItems: RawCalendarImportItem[],
  existing: ExistingCalendarException[],
  idFactory: () => string = () => crypto.randomUUID(),
): CalendarImportDraft {
  const seen = new Set<string>();
  const existingKeys = new Set(
    existing.map((row) =>
      calendarExceptionDuplicateKey({
        variantId: row.variantId,
        academicYearId: row.academicYearId,
        semesterId: row.semesterId,
        kind: row.kind,
        startDate: row.startDate,
        endDate: row.endDate,
        title: row.title,
      }),
    ),
  );

  const items = rawItems.map((raw) => {
    const evaluated = evaluateCalendarImportItem(raw, scope, idFactory());
    if (evaluated.status !== "ready" || !evaluated.kind || !evaluated.startDate) {
      return evaluated;
    }
    const key = calendarExceptionDuplicateKey({
      variantId: scope.variantId,
      academicYearId: scope.academicYearId,
      semesterId: scope.semesterId,
      kind: evaluated.kind,
      startDate: evaluated.startDate,
      endDate: evaluated.endDate,
      title: evaluated.title,
    });
    if (existingKeys.has(key) || seen.has(key)) {
      return {
        ...evaluated,
        status: "duplicate" as const,
        reviewReason: CALENDAR_IMPORT_DUPLICATE_MESSAGE,
        selected: false,
      };
    }
    seen.add(key);
    return evaluated;
  });

  return {
    variantCode: scope.variantCode,
    variantId: scope.variantId,
    academicYearId: scope.academicYearId,
    semesterId: scope.semesterId,
    academicYearLabel: scope.academicYearLabel,
    semesterLabel: scope.semesterLabel,
    variantLabel: scope.variantLabel,
    semesterStart: scope.semesterStart,
    semesterEnd: scope.semesterEnd,
    items,
  };
}

export function decideCalendarImportApproval(input: {
  scope: CalendarImportScope;
  items: CalendarImportApprovalItem[];
  existing: ExistingCalendarException[];
}): CalendarImportApprovalDecision[] {
  const seen = new Set<string>();
  const existingKeys = new Set(
    input.existing.map((row) =>
      calendarExceptionDuplicateKey({
        variantId: row.variantId,
        academicYearId: row.academicYearId,
        semesterId: row.semesterId,
        kind: row.kind,
        startDate: row.startDate,
        endDate: row.endDate,
        title: row.title,
      }),
    ),
  );

  const decisions: CalendarImportApprovalDecision[] = [];

  for (const item of input.items) {
    if (item.selected === false) continue;
    const evaluated = evaluateCalendarImportItem(
      {
        kind: item.kind,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        confidence: 1,
      },
      input.scope,
      "approval",
    );

    if (evaluated.status === "needs_review" || !evaluated.kind || !evaluated.startDate) {
      decisions.push({
        outcome: "rejected",
        title: evaluated.title || asText(item.title),
        message: evaluated.reviewReason ?? CALENDAR_IMPORT_NOT_APPROVED_MESSAGE,
      });
      continue;
    }

    const key = calendarExceptionDuplicateKey({
      variantId: input.scope.variantId,
      academicYearId: input.scope.academicYearId,
      semesterId: input.scope.semesterId,
      kind: evaluated.kind,
      startDate: evaluated.startDate,
      endDate: evaluated.endDate,
      title: evaluated.title,
    });

    if (existingKeys.has(key) || seen.has(key)) {
      decisions.push({
        outcome: "duplicate",
        title: evaluated.title,
        message: CALENDAR_IMPORT_DUPLICATE_MESSAGE,
      });
      continue;
    }

    seen.add(key);
    decisions.push({
      outcome: "insert",
      row: {
        variant_id: input.scope.variantId,
        academic_year_id: input.scope.academicYearId,
        semester_id: input.scope.semesterId,
        kind: evaluated.kind,
        action: "add",
        starts_at: evaluated.startDate,
        ends_at: evaluated.endDate,
        title: evaluated.title.slice(0, 160),
        is_teaching_day: evaluated.kind === "teaching_day",
        is_remote: evaluated.kind === "remote",
      },
    });
  }

  return decisions;
}

export function emptyManualImportItem(
  idFactory: () => string = () => crypto.randomUUID(),
): CalendarImportDraftItem {
  return {
    clientId: idFactory(),
    kind: "holiday",
    title: "",
    startDate: "",
    endDate: "",
    hijriLabel: "",
    confidence: 1,
    status: "needs_review",
    reviewReason: CALENDAR_IMPORT_EMPTY_TITLE_MESSAGE,
    selected: false,
  };
}
