/**
 * Pure Google Sheets distribution parse + preview validation.
 * No DB writes, no Google writes, no dates, no planner generation.
 */

export const DEFAULT_DISTRIBUTION_WORKSHEET = "التوزيع";

export const DISTRIBUTION_SCHEDULE_WORKSHEET_MESSAGE =
  "لا يمكن استيراد التوزيع من ورقة Schedule لأنها مؤرخة وتخلط التوزيع بالتقويم.";
export const DISTRIBUTION_WORKSHEET_REQUIRED_MESSAGE = "اسم ورقة العمل مطلوب.";
export const DISTRIBUTION_WORKSHEET_INVALID_MESSAGE = "اسم ورقة العمل غير صالح.";
export const DISTRIBUTION_EMPTY_SHEET_MESSAGE = "ورقة التوزيع فارغة.";
export const DISTRIBUTION_NO_ROWS_MESSAGE = "لا توجد صفوف توزيع في الورقة.";
export const DISTRIBUTION_MISSING_ORDER_MESSAGE = "الترتيب مطلوب.";
export const DISTRIBUTION_NON_NUMERIC_ORDER_MESSAGE = "الترتيب غير رقمي.";
export const DISTRIBUTION_INVALID_ORDER_MESSAGE = "الترتيب يجب أن يكون رقمًا صحيحًا أكبر من صفر.";
export const DISTRIBUTION_DUPLICATE_ORDER_MESSAGE = "الترتيب مكرر.";
export const DISTRIBUTION_MISSING_LESSON_MESSAGE = "اسم الدرس مطلوب.";
export const DISTRIBUTION_MISSING_PERIODS_MESSAGE = "عدد الحصص مطلوب.";
export const DISTRIBUTION_NON_NUMERIC_PERIODS_MESSAGE = "عدد الحصص غير رقمي.";
export const DISTRIBUTION_INVALID_PERIODS_MESSAGE =
  "عدد الحصص يجب أن يكون رقمًا صحيحًا أكبر من صفر.";
export const DISTRIBUTION_ZERO_PERIODS_MESSAGE = "عدد الحصص يجب أن يكون أكبر من صفر.";
export const DISTRIBUTION_INVALID_LESSON_ID_MESSAGE = "معرف درس المنهج غير صالح.";
export const DISTRIBUTION_EMPTY_UNIT_MESSAGE = "الوحدة فارغة وتحتاج مراجعة.";
export const DISTRIBUTION_MISSING_CURRICULUM_ID_MESSAGE =
  "معرف درس المنهج غير موجود ويحتاج مراجعة.";
export const DISTRIBUTION_CURRICULUM_NOT_FOUND_MESSAGE =
  "درس المنهج غير موجود في الكتالوج ويحتاج مراجعة.";
export const DISTRIBUTION_NON_SEQUENTIAL_ORDER_MESSAGE = "ترتيب الدروس غير متسلسل.";
export const DISTRIBUTION_UNCLEAR_DATA_MESSAGE = "بيانات الصف غير واضحة وتحتاج مراجعة.";
export const DISTRIBUTION_MISSING_ENV_MESSAGE =
  "إعدادات Google Sheets غير مكتملة. تحقق من GOOGLE_SHEETS_CLIENT_EMAIL وGOOGLE_SHEETS_PRIVATE_KEY وGOOGLE_SHEET_ID.";
export const DISTRIBUTION_FETCH_FAILED_MESSAGE = "تعذر قراءة ورقة التوزيع من Google Sheets.";
export const DISTRIBUTION_CURRICULUM_LOOKUP_FAILED_MESSAGE =
  "تعذر التحقق من دروس المنهج. لم يُخمَّن الربط.";
export const DISTRIBUTION_PLAN_CONTEXT_UNAVAILABLE_NOTE =
  "سياق الخطة غير متوفر في مسار معاينة Google Sheets الحالي. لا يُخترع academic_year_id أو semester_id أو grade_id أو subject_id أو semester_plan_id. سيُمرَّر السياق لاحقًا عند الربط بخطة فصل.";
export const DISTRIBUTION_CAPACITY_UNKNOWN_NOTE =
  "سعة الجدول غير معروفة. يُعرض مجموع الحصص فقط دون حساب شواغر أو تواريخ.";
export const DISTRIBUTION_CAPACITY_NO_PLAN_NOTE =
  "اختر مسودة خطة فصل لحساب الشواغر من التقويم وجدول المعلم.";
export const DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE =
  "لا يوجد جدول معلم لهذه الخطة. لا تُستخدم السعة الافتراضية في المعاينة.";
export const DISTRIBUTION_CAPACITY_MISSING_SCOPE_NOTE =
  "لا يمكن حساب السعة بدون مادة وصف في خطة الفصل.";
export const DISTRIBUTION_CAPACITY_CALENDAR_FAILED_NOTE = "تعذر حل تقويم الخطة. لم تُحسب الشواغر.";
export const DISTRIBUTION_CAPACITY_FIT_NOTE = "طلب التوزيع يساوي عدد الشواغر المتاحة في الفصل.";
export const DISTRIBUTION_CAPACITY_SURPLUS_NOTE = "يوجد شواغر فائضة بعد تغطية التوزيع.";
export const DISTRIBUTION_CAPACITY_DEFICIT_NOTE =
  "طلب التوزيع أكبر من الشواغر المتاحة. الحصص الزائدة لن تُجدول.";

const CURRICULUM_LESSON_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_ALIASES = ["order", "الترتيب", "رقم", "رقم_الدرس", "تسلسل"];
const UNIT_ALIASES = ["unit", "الوحدة", "وحدة"];
const LESSON_ALIASES = ["lesson", "الدرس", "عنوان_الدرس", "عنوان"];
const PERIODS_ALIASES = ["periods", "عدد_الحصص", "الحصص", "periods_count"];
const NOTES_ALIASES = ["notes", "ملاحظات", "ملاحظة"];
const LESSON_ID_ALIASES = ["curriculum_lesson_id", "معرف_الدرس", "معرف_درس_المنهج", "lesson_id"];

/** Dated / timetable columns that must never become distribution fields. */
export const IGNORED_DISTRIBUTION_HEADERS = [
  "hijri_date",
  "gregorian_date",
  "day",
  "week",
  "period",
  "region",
  "date",
  "التاريخ",
  "التاريخ_الهجري",
  "التاريخ_الميلادي",
  "اليوم",
  "الأسبوع",
  "الحصة",
  "المنطقة",
];

export type DistributionIssueSeverity = "error" | "warning";
export type DistributionItemStatus = "ready" | "needs_review" | "error";
export type DistributionCurriculumMatch =
  "matched" | "missing_id" | "not_found" | "invalid" | "unchecked";
export type DistributionCapacityStatus = "known" | "unknown";
export type DistributionCapacityComparison = "surplus" | "fit" | "deficit";

export interface DistributionIssue {
  severity: DistributionIssueSeverity;
  code: string;
  message: string;
}

export interface DistributionDraftItem {
  clientId: string;
  order: number | null;
  unit: string;
  lesson: string;
  periods: number | null;
  notes: string;
  curriculumLessonId: string | null;
  curriculumLessonTitle: string | null;
  curriculumMatch: DistributionCurriculumMatch;
  status: DistributionItemStatus;
  issues: DistributionIssue[];
  reviewReason: string | null;
}

export interface DistributionSummary {
  itemCount: number;
  totalPeriods: number;
  readyCount: number;
  reviewCount: number;
  errorCount: number;
  warningCount: number;
}

export interface DistributionPlanContext {
  academicYearId: string | null;
  semesterId: string | null;
  gradeId: string | null;
  subjectId: string | null;
  semesterPlanId: string | null;
  available: boolean;
  note: string | null;
}

export interface DistributionCapacity {
  totalPeriods: number;
  availableSlots: number | null;
  status: DistributionCapacityStatus;
  note: string;
  delta: number | null;
  comparison: DistributionCapacityComparison | null;
  weeklyMatchingSlots: number | null;
  teachingDayCount: number | null;
}

export interface DistributionDraft {
  spreadsheetId: string;
  worksheetName: string;
  items: DistributionDraftItem[];
  summary: DistributionSummary;
  context: DistributionPlanContext;
  capacity: DistributionCapacity;
  readyCount: number;
  reviewCount: number;
  errors: string[];
  warnings: string[];
}

export interface DistributionParseMeta {
  spreadsheetId: string;
  worksheetName: string;
  context?: Partial<DistributionPlanContext> | null;
}

export interface CurriculumLessonMatch {
  id: string;
  title: string;
}

export function emptyDistributionPlanContext(): DistributionPlanContext {
  return {
    academicYearId: null,
    semesterId: null,
    gradeId: null,
    subjectId: null,
    semesterPlanId: null,
    available: false,
    note: DISTRIBUTION_PLAN_CONTEXT_UNAVAILABLE_NOTE,
  };
}

export function resolveDistributionPlanContext(
  input?: Partial<DistributionPlanContext> | null,
): DistributionPlanContext {
  const academicYearId = input?.academicYearId?.trim() || null;
  const semesterId = input?.semesterId?.trim() || null;
  const gradeId = input?.gradeId?.trim() || null;
  const subjectId = input?.subjectId?.trim() || null;
  const semesterPlanId = input?.semesterPlanId?.trim() || null;
  const available = Boolean(academicYearId || semesterId || gradeId || subjectId || semesterPlanId);
  return {
    academicYearId,
    semesterId,
    gradeId,
    subjectId,
    semesterPlanId,
    available,
    note: available ? null : DISTRIBUTION_PLAN_CONTEXT_UNAVAILABLE_NOTE,
  };
}

export function unknownDistributionCapacity(
  totalPeriods: number,
  note: string = DISTRIBUTION_CAPACITY_UNKNOWN_NOTE,
): DistributionCapacity {
  return {
    totalPeriods,
    availableSlots: null,
    status: "unknown",
    note,
    delta: null,
    comparison: null,
    weeklyMatchingSlots: null,
    teachingDayCount: null,
  };
}

export function normalizeDistributionHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function assertDistributionWorksheetName(raw: string | undefined): string {
  const name = (raw ?? DEFAULT_DISTRIBUTION_WORKSHEET).trim();
  if (!name) {
    throw new Error(DISTRIBUTION_WORKSHEET_REQUIRED_MESSAGE);
  }
  if (name.length > 100 || /[!\n\r]/.test(name)) {
    throw new Error(DISTRIBUTION_WORKSHEET_INVALID_MESSAGE);
  }
  const key = name.replace(/!+$/g, "").trim().toLowerCase();
  if (key === "schedule") {
    throw new Error(DISTRIBUTION_SCHEDULE_WORKSHEET_MESSAGE);
  }
  return name;
}

export function toDistributionValuesRange(worksheetName: string): string {
  const safeName = assertDistributionWorksheetName(worksheetName);
  return `'${safeName.replace(/'/g, "''")}'!A1:Z5000`;
}

export function missingDistributionColumnsMessage(columns: string[]): string {
  return `أعمدة التوزيع المطلوبة مفقودة: ${columns.join("، ")}.`;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

function parseSignedInteger(raw: string): number | null {
  const normalized = normalizeArabicDigits(raw).trim();
  if (!/^-?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isInteger(value) ? value : null;
}

function issue(
  severity: DistributionIssueSeverity,
  code: string,
  message: string,
): DistributionIssue {
  return { severity, code, message };
}

function isUnclearLesson(lesson: string): boolean {
  if (!lesson) return false;
  if (lesson.length < 2) return true;
  return /^[.?؟\-_/\\]+$/.test(lesson);
}

function itemStatus(issues: DistributionIssue[]): DistributionItemStatus {
  if (issues.some((entry) => entry.severity === "error")) return "error";
  if (issues.some((entry) => entry.severity === "warning")) return "needs_review";
  return "ready";
}

function reviewReasonFrom(issues: DistributionIssue[]): string | null {
  if (!issues.length) return null;
  return issues.map((entry) => entry.message).join(" ");
}

export function sumDistributionPeriods(items: Array<{ periods: number | null }>): number {
  return items.reduce((sum, item) => {
    if (item.periods == null || item.periods < 1) return sum;
    return sum + item.periods;
  }, 0);
}

export function buildDistributionSummary(
  items: DistributionDraftItem[],
  sheetErrors: string[],
  sheetWarnings: string[],
): DistributionSummary {
  const errorIssues = items.reduce(
    (count, item) => count + item.issues.filter((entry) => entry.severity === "error").length,
    0,
  );
  const warningIssues = items.reduce(
    (count, item) => count + item.issues.filter((entry) => entry.severity === "warning").length,
    0,
  );
  return {
    itemCount: items.length,
    totalPeriods: sumDistributionPeriods(items),
    readyCount: items.filter((item) => item.status === "ready").length,
    reviewCount: items.filter((item) => item.status === "needs_review").length,
    errorCount: errorIssues + sheetErrors.length,
    warningCount: warningIssues + sheetWarnings.length,
  };
}

function withSummary(
  draft: Omit<DistributionDraft, "summary" | "capacity" | "readyCount" | "reviewCount"> & {
    summary?: DistributionSummary;
    capacity?: DistributionCapacity;
  },
): DistributionDraft {
  const summary = buildDistributionSummary(draft.items, draft.errors, draft.warnings);
  return {
    ...draft,
    summary,
    capacity: unknownDistributionCapacity(summary.totalPeriods),
    readyCount: summary.readyCount,
    reviewCount: summary.reviewCount,
  };
}

function emptyDraft(
  meta: DistributionParseMeta,
  errors: string[],
  warnings: string[] = [],
): DistributionDraft {
  return withSummary({
    spreadsheetId: meta.spreadsheetId,
    worksheetName: assertDistributionWorksheetName(meta.worksheetName),
    items: [],
    context: resolveDistributionPlanContext(meta.context),
    errors,
    warnings,
  });
}

export function hasSequentialOrders(items: DistributionDraftItem[]): boolean {
  const orders = items
    .map((item) => item.order)
    .filter((order): order is number => order != null && order >= 1)
    .sort((a, b) => a - b);
  const unique = [...new Set(orders)];
  if (!unique.length) return true;
  return unique.every((order, index) => order === index + 1);
}

function applyDuplicateAndSequenceIssues(items: DistributionDraftItem[]): string[] {
  const orderCounts = new Map<number, number>();
  for (const item of items) {
    if (item.order == null) continue;
    orderCounts.set(item.order, (orderCounts.get(item.order) ?? 0) + 1);
  }

  for (const item of items) {
    if (item.order == null) continue;
    if ((orderCounts.get(item.order) ?? 0) < 2) continue;
    if (item.issues.some((entry) => entry.code === "duplicate_order")) continue;
    item.issues.push(issue("error", "duplicate_order", DISTRIBUTION_DUPLICATE_ORDER_MESSAGE));
    item.status = itemStatus(item.issues);
    item.reviewReason = reviewReasonFrom(item.issues);
  }

  const warnings: string[] = [];
  if (!hasSequentialOrders(items)) {
    warnings.push(DISTRIBUTION_NON_SEQUENTIAL_ORDER_MESSAGE);
  }
  return warnings;
}

export function parseDistributionSheet(
  rows: string[][],
  meta: DistributionParseMeta,
): DistributionDraft {
  const worksheetName = assertDistributionWorksheetName(meta.worksheetName);
  const context = resolveDistributionPlanContext(meta.context);

  if (!rows.length) {
    return emptyDraft({ ...meta, worksheetName }, [DISTRIBUTION_EMPTY_SHEET_MESSAGE]);
  }

  const headers = rows[0].map(normalizeDistributionHeader);
  const orderIdx = findColumnIndex(headers, ORDER_ALIASES);
  const lessonIdx = findColumnIndex(headers, LESSON_ALIASES);
  const periodsIdx = findColumnIndex(headers, PERIODS_ALIASES);
  const unitIdx = findColumnIndex(headers, UNIT_ALIASES);
  const notesIdx = findColumnIndex(headers, NOTES_ALIASES);
  const lessonIdIdx = findColumnIndex(headers, LESSON_ID_ALIASES);

  const missing: string[] = [];
  if (orderIdx < 0) missing.push("order");
  if (lessonIdx < 0) missing.push("lesson");
  if (periodsIdx < 0) missing.push("periods");
  if (missing.length) {
    return emptyDraft({ ...meta, worksheetName }, [missingDistributionColumnsMessage(missing)]);
  }

  const body = rows.slice(1).filter((row) => row.some((value) => String(value ?? "").trim()));
  if (!body.length) {
    return emptyDraft({ ...meta, worksheetName }, [DISTRIBUTION_NO_ROWS_MESSAGE]);
  }

  const items: DistributionDraftItem[] = body.map((row, index) => {
    const orderRaw = cell(row, orderIdx);
    const lesson = cell(row, lessonIdx);
    const periodsRaw = cell(row, periodsIdx);
    const unit = cell(row, unitIdx);
    const notes = cell(row, notesIdx);
    const lessonIdRaw = cell(row, lessonIdIdx);
    const issues: DistributionIssue[] = [];

    const parsedOrder = orderRaw ? parseSignedInteger(orderRaw) : null;
    let order: number | null = null;
    if (!orderRaw) {
      issues.push(issue("error", "missing_order", DISTRIBUTION_MISSING_ORDER_MESSAGE));
    } else if (parsedOrder == null) {
      issues.push(issue("error", "non_numeric_order", DISTRIBUTION_NON_NUMERIC_ORDER_MESSAGE));
    } else if (parsedOrder < 1) {
      issues.push(issue("error", "invalid_order", DISTRIBUTION_INVALID_ORDER_MESSAGE));
    } else {
      order = parsedOrder;
    }

    if (!lesson) {
      issues.push(issue("error", "missing_lesson", DISTRIBUTION_MISSING_LESSON_MESSAGE));
    } else if (isUnclearLesson(lesson)) {
      issues.push(issue("warning", "unclear_data", DISTRIBUTION_UNCLEAR_DATA_MESSAGE));
    }

    const parsedPeriods = periodsRaw ? parseSignedInteger(periodsRaw) : null;
    let periods: number | null = null;
    if (!periodsRaw) {
      issues.push(issue("error", "missing_periods", DISTRIBUTION_MISSING_PERIODS_MESSAGE));
    } else if (parsedPeriods == null) {
      issues.push(issue("error", "non_numeric_periods", DISTRIBUTION_NON_NUMERIC_PERIODS_MESSAGE));
    } else if (parsedPeriods < 1) {
      issues.push(issue("error", "zero_periods", DISTRIBUTION_ZERO_PERIODS_MESSAGE));
    } else {
      periods = parsedPeriods;
    }

    let curriculumLessonId: string | null = null;
    let curriculumMatch: DistributionCurriculumMatch = "missing_id";
    if (!lessonIdRaw) {
      issues.push(
        issue("warning", "missing_curriculum_id", DISTRIBUTION_MISSING_CURRICULUM_ID_MESSAGE),
      );
    } else if (!CURRICULUM_LESSON_ID_RE.test(lessonIdRaw)) {
      issues.push(issue("error", "invalid_curriculum_id", DISTRIBUTION_INVALID_LESSON_ID_MESSAGE));
      curriculumMatch = "invalid";
    } else {
      curriculumLessonId = lessonIdRaw;
      curriculumMatch = "unchecked";
    }

    if (!unit) {
      issues.push(issue("warning", "empty_unit", DISTRIBUTION_EMPTY_UNIT_MESSAGE));
    }

    return {
      clientId: `dist-${index + 1}`,
      order,
      unit,
      lesson,
      periods,
      notes,
      curriculumLessonId,
      curriculumLessonTitle: null,
      curriculumMatch,
      status: itemStatus(issues),
      issues,
      reviewReason: reviewReasonFrom(issues),
    };
  });

  const warnings = applyDuplicateAndSequenceIssues(items);
  return withSummary({
    spreadsheetId: meta.spreadsheetId,
    worksheetName,
    items,
    context,
    errors: [],
    warnings,
  });
}

export function applyCurriculumMatches(
  draft: DistributionDraft,
  existing: CurriculumLessonMatch[],
): DistributionDraft {
  const byId = new Map(existing.map((row) => [row.id, row.title]));
  const items = draft.items.map((item) => {
    if (item.curriculumMatch === "invalid" || item.curriculumMatch === "missing_id") {
      return item;
    }
    if (!item.curriculumLessonId) {
      return item;
    }
    const title = byId.get(item.curriculumLessonId);
    const issues = item.issues.filter((entry) => entry.code !== "curriculum_not_found");
    if (title == null) {
      issues.push(
        issue("warning", "curriculum_not_found", DISTRIBUTION_CURRICULUM_NOT_FOUND_MESSAGE),
      );
      return {
        ...item,
        curriculumLessonTitle: null,
        curriculumMatch: "not_found" as const,
        issues,
        status: itemStatus(issues),
        reviewReason: reviewReasonFrom(issues),
      };
    }
    return {
      ...item,
      curriculumLessonTitle: title,
      curriculumMatch: "matched" as const,
      issues,
      status: itemStatus(issues),
      reviewReason: reviewReasonFrom(issues),
    };
  });

  return withSummary({
    ...draft,
    items,
  });
}

export function withDistributionPlanContext(
  draft: DistributionDraft,
  context?: Partial<DistributionPlanContext> | null,
): DistributionDraft {
  return {
    ...draft,
    context: resolveDistributionPlanContext(context),
  };
}

export function markCurriculumLookupFailed(draft: DistributionDraft): DistributionDraft {
  const warnings = draft.warnings.includes(DISTRIBUTION_CURRICULUM_LOOKUP_FAILED_MESSAGE)
    ? draft.warnings
    : [...draft.warnings, DISTRIBUTION_CURRICULUM_LOOKUP_FAILED_MESSAGE];
  return withSummary({
    ...draft,
    warnings,
  });
}
