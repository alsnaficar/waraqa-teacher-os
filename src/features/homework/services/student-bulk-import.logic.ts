import type { Student } from "./student.service";

/** Classroom-scale paste cap (≈5 classes × 40). Prevents runaway client loops. */
export const STUDENT_BULK_IMPORT_MAX = 200;

export type ParsedStudentImportRow = {
  lineNumber: number;
  fullName: string;
  studentCode: string | null;
  /** Raw status after parse + in-batch de-dupe. */
  status: "valid" | "invalid" | "batch_duplicate";
  reason?: string;
};

export type StudentImportPlanItem = {
  lineNumber: number;
  fullName: string;
  studentCode: string | null;
  action: "create" | "skip_batch_duplicate" | "skip_already_exists" | "skip_invalid";
  reason?: string;
};

export type StudentImportPlan = {
  items: StudentImportPlanItem[];
  truncated: boolean;
  createCount: number;
  invalidCount: number;
  batchDuplicateCount: number;
  alreadyExistsCount: number;
};

export type StudentBulkImportSummary = {
  added: number;
  skippedDuplicate: number;
  alreadyExists: number;
  invalid: number;
  truncated: boolean;
};

/**
 * Normalize Arabic/Latin student names for comparison:
 * trim + collapse internal whitespace. Case-fold Latin only.
 * Does NOT treat full_name as globally unique — callers scope by class.
 */
export function normalizeStudentName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

/**
 * Parse pasted roster text.
 * Formats:
 * - one name per line
 * - optional `name,code` or `name\tcode`
 */
export function parseStudentImportText(raw: string): {
  rows: ParsedStudentImportRow[];
  truncated: boolean;
} {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: ParsedStudentImportRow[] = [];
  const seen = new Map<string, number>();
  let truncated = false;
  let validKept = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const line = lines[i] ?? "";
    if (!line.trim()) continue;

    if (validKept >= STUDENT_BULK_IMPORT_MAX) {
      truncated = true;
      break;
    }

    const parsed = parseImportLine(line);
    if (!parsed.ok) {
      rows.push({
        lineNumber,
        fullName: parsed.fullName,
        studentCode: null,
        status: "invalid",
        reason: parsed.reason,
      });
      continue;
    }

    const key = normalizeStudentName(parsed.fullName);
    const firstLine = seen.get(key);
    if (firstLine != null) {
      rows.push({
        lineNumber,
        fullName: parsed.fullName,
        studentCode: parsed.studentCode,
        status: "batch_duplicate",
        reason: `مكرر في نفس القائمة (السطر ${firstLine}).`,
      });
      continue;
    }

    seen.set(key, lineNumber);
    validKept += 1;
    rows.push({
      lineNumber,
      fullName: parsed.fullName,
      studentCode: parsed.studentCode,
      status: "valid",
    });
  }

  return { rows, truncated };
}

function parseImportLine(
  line: string,
):
  | { ok: true; fullName: string; studentCode: string | null }
  | { ok: false; fullName: string; reason: string } {
  const trimmed = line.trim();
  if (!trimmed) {
    return { ok: false, fullName: "", reason: "سطر فارغ." };
  }

  let fullName = trimmed;
  let studentCode: string | null = null;

  if (trimmed.includes("\t")) {
    const parts = trimmed.split("\t").map((part) => part.trim());
    fullName = parts[0] ?? "";
    studentCode = parts[1] || null;
  } else if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((part) => part.trim());
    fullName = parts[0] ?? "";
    studentCode = parts[1] || null;
  }

  fullName = fullName.replace(/\s+/g, " ").trim();
  if (!fullName) {
    return { ok: false, fullName: "", reason: "اسم الطالب مطلوب." };
  }
  if (fullName.length > 200) {
    return { ok: false, fullName, reason: "الاسم طويل جداً." };
  }
  if (studentCode && studentCode.length > 64) {
    return { ok: false, fullName, reason: "رمز الطالب طويل جداً." };
  }

  return { ok: true, fullName, studentCode };
}

/**
 * Plan import against an existing class roster.
 * Same-class + same normalized name → already exists (no DB unique on full_name).
 * Different classes may share the same name.
 */
export function planStudentImport(
  parsed: ParsedStudentImportRow[],
  existingInClass: Student[],
  options: { truncated?: boolean } = {},
): StudentImportPlan {
  const existingNames = new Set(
    existingInClass.map((student) => normalizeStudentName(student.fullName)),
  );

  const items: StudentImportPlanItem[] = parsed.map((row) => {
    if (row.status === "invalid") {
      return {
        lineNumber: row.lineNumber,
        fullName: row.fullName,
        studentCode: row.studentCode,
        action: "skip_invalid",
        reason: row.reason,
      };
    }
    if (row.status === "batch_duplicate") {
      return {
        lineNumber: row.lineNumber,
        fullName: row.fullName,
        studentCode: row.studentCode,
        action: "skip_batch_duplicate",
        reason: row.reason,
      };
    }

    const key = normalizeStudentName(row.fullName);
    if (existingNames.has(key)) {
      return {
        lineNumber: row.lineNumber,
        fullName: row.fullName,
        studentCode: row.studentCode,
        action: "skip_already_exists",
        reason: "يوجد طالب بنفس الاسم في هذا الفصل.",
      };
    }

    // Mark as reserved so later valid rows in the same plan don't collide.
    existingNames.add(key);
    return {
      lineNumber: row.lineNumber,
      fullName: row.fullName,
      studentCode: row.studentCode,
      action: "create",
    };
  });

  return {
    items,
    truncated: Boolean(options.truncated),
    createCount: items.filter((item) => item.action === "create").length,
    invalidCount: items.filter((item) => item.action === "skip_invalid").length,
    batchDuplicateCount: items.filter((item) => item.action === "skip_batch_duplicate").length,
    alreadyExistsCount: items.filter((item) => item.action === "skip_already_exists").length,
  };
}

export function summarizeStudentImport(
  plan: StudentImportPlan,
  added: number,
): StudentBulkImportSummary {
  return {
    added,
    skippedDuplicate: plan.batchDuplicateCount,
    alreadyExists: plan.alreadyExistsCount,
    invalid: plan.invalidCount,
    truncated: plan.truncated,
  };
}

export function formatStudentImportSummary(summary: StudentBulkImportSummary): string {
  const parts = [
    `تمت إضافة ${summary.added}`,
    `مكرر في القائمة ${summary.skippedDuplicate}`,
    `موجود مسبقاً ${summary.alreadyExists}`,
    `غير صالح ${summary.invalid}`,
  ];
  if (summary.truncated) {
    parts.push(`تم الاقتصار على أول ${STUDENT_BULK_IMPORT_MAX} اسماً صالحاً`);
  }
  return parts.join(" · ");
}
