import type { MadrasatiClass } from "../provider/models.ts";
import {
  sanitizePageLandmarks,
  type MadrasatiLabeledValue,
  type MadrasatiPageLandmarks,
  type MadrasatiTableRow,
} from "./madrasati-teacher-profile.ts";

export const MADRASATI_CLASSES_UNAVAILABLE_CODE = "CLASSES_UNAVAILABLE" as const;

export const MADRASATI_CLASSES_UNAVAILABLE_MESSAGE =
  "تعذر قراءة الفصول من صفحة المقررات في مدرستي.";

export type MadrasatiClassExtractionStatus = "found" | "empty" | "unavailable";

export type MadrasatiClassExtraction = {
  readonly status: MadrasatiClassExtractionStatus;
  readonly classes: readonly MadrasatiClass[];
};

const GRADE_ORDINALS = [
  "الأول",
  "الاول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
] as const;

const STAGE_WORDS = ["الابتدائي", "الابتدائية", "المتوسط", "المتوسطة", "الثانوي", "الثانوية"] as const;

const EMPTY_MARKERS = [
  "لا توجد مقررات",
  "لا يوجد مقررات",
  "لم يتم إسناد مقررات",
  "لا توجد بيانات",
] as const;

const GRADE_HEADERS = ["الصف الدراسي", "اسم الصف", "الصف"];
const CLASS_HEADERS = ["اسم الشعبة", "الشعبة", "اسم الفصل", "الفصل"];
const STAGE_HEADERS = ["المرحلة الدراسية", "المرحلة"];

const GRADE_PATTERN = new RegExp(
  `(?:الصف\\s+)?(?:${GRADE_ORDINALS.join("|")})(?:\\s+(?:${STAGE_WORDS.join("|")}))?`,
);

const COMBINED_PATTERN = new RegExp(
  `(الصف\\s+(?:${GRADE_ORDINALS.join("|")})(?:\\s+(?:${STAGE_WORDS.join("|")}))?)\\s*(?:[/|·,\\-–]\\s*)?(?:شعبة|فصل)?\\s*([^\\n|]{1,12})`,
);

/**
 * Maps a semantic Madrasati page snapshot to assigned classes.
 * Fail-closed: unavailable unless classes can be read or the catalog is confirmed empty.
 */
export function extractMadrasatiClasses(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiClassExtraction {
  const landmarks = sanitizePageLandmarks(snapshot);
  const collected: MadrasatiClass[] = [];

  collectFromTableRows(landmarks.tableRows ?? [], collected);
  collectFromLabeledPairs(landmarks.labeledValues, collected);
  collectFromText(landmarks.text, collected);
  collectFromAccessibleNames(landmarks.accessibleNames, collected);

  const classes = dedupeClasses(collected);

  if (classes.length > 0) {
    return { status: "found", classes };
  }

  if (isConfirmedEmptyCatalog(landmarks)) {
    return { status: "empty", classes: [] };
  }

  return { status: "unavailable", classes: [] };
}

function collectFromTableRows(
  rows: readonly MadrasatiTableRow[],
  collected: MadrasatiClass[],
): void {
  for (const row of rows) {
    const mapped = classFromTableRow(row);
    if (mapped) {
      collected.push(mapped);
    }
  }
}

function classFromTableRow(row: MadrasatiTableRow): MadrasatiClass | null {
  const gradeFromHeader = cellForHeaders(row, GRADE_HEADERS);
  const classFromHeader = cellForHeaders(row, CLASS_HEADERS);
  const stageFromHeader = cellForHeaders(row, STAGE_HEADERS);

  if (gradeFromHeader && classFromHeader) {
    return toClass(gradeFromHeader, classFromHeader, stageFromHeader);
  }

  const combined = parseCombined(row.cells.join(" / "));
  if (combined) {
    return toClass(combined.grade, combined.className, stageFromHeader);
  }

  let grade: string | undefined;
  let className: string | undefined;

  for (const cell of row.cells) {
    if (!grade && isGradeValue(cell) && !isClassNameValue(cell)) {
      grade = cell;
      continue;
    }
    if (!className && isClassNameValue(cell) && !isGradeValue(cell)) {
      className = cell;
    }
  }

  if (grade && className) {
    return toClass(grade, className, stageFromHeader);
  }

  return null;
}

function collectFromLabeledPairs(
  rows: readonly MadrasatiLabeledValue[],
  collected: MadrasatiClass[],
): void {
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    if (!current || !isGradeHeader(current.label)) {
      continue;
    }

    const nextClass = rows.slice(index + 1, index + 4).find((row) => isClassHeader(row.label));
    const nextStage = rows.slice(index + 1, index + 5).find((row) => isStageHeader(row.label));

    const combined = parseCombined(current.value);
    if (combined) {
      collected.push(
        toClass(combined.grade, combined.className, nextStage?.value) ?? combined,
      );
      continue;
    }

    if (nextClass) {
      const mapped = toClass(current.value, nextClass.value, nextStage?.value);
      if (mapped) {
        collected.push(mapped);
      }
    }
  }
}

function collectFromText(text: string, collected: MadrasatiClass[]): void {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const inlineLabels: MadrasatiLabeledValue[] = [];

  for (const line of lines) {
    const inline = parseInlineLabeledLine(line);
    if (inline) {
      inlineLabels.push(inline);
    }
  }

  collectFromLabeledPairs(inlineLabels, collected);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const combined = parseCombined(line);
    if (combined) {
      collected.push(combined);
      continue;
    }

    if (!isGradeHeader(line) || index + 1 >= lines.length) {
      continue;
    }

    const grade = lines[index + 1] ?? "";
    const classLineIndex = lines
      .slice(index + 2, index + 6)
      .findIndex((candidate) => isClassHeader(candidate));

    if (classLineIndex < 0) {
      continue;
    }

    const className = lines[index + 2 + classLineIndex + 1];
    const stageLineIndex = lines
      .slice(index + 2, index + 8)
      .findIndex((candidate) => isStageHeader(candidate));
    const stage =
      stageLineIndex >= 0 ? lines[index + 2 + stageLineIndex + 1] : undefined;

    const mapped = toClass(grade, className ?? "", stage);
    if (mapped) {
      collected.push(mapped);
    }
  }

  for (const match of text.matchAll(new RegExp(COMBINED_PATTERN, "g"))) {
    const mapped = toClass(match[1] ?? "", match[2] ?? "");
    if (mapped) {
      collected.push(mapped);
    }
  }
}

function collectFromAccessibleNames(
  names: readonly string[],
  collected: MadrasatiClass[],
): void {
  for (const name of names) {
    const combined = parseCombined(name);
    if (combined) {
      collected.push(combined);
    }
  }
}

function parseInlineLabeledLine(line: string): MadrasatiLabeledValue | null {
  const match = line.match(
    /^(الصف الدراسي|اسم الصف|الصف|اسم الشعبة|الشعبة|اسم الفصل|الفصل|المرحلة الدراسية|المرحلة)\s*[:：]\s*(.+)$/,
  );

  if (!match?.[1] || !match[2] || normalizeHeader(match[1]) === "الفصل الدراسي") {
    return null;
  }

  return { label: match[1], value: match[2].trim() };
}

function parseCombined(source: string): MadrasatiClass | null {
  const match = source.match(COMBINED_PATTERN);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return toClass(match[1], match[2]);
}

function toClass(
  gradeRaw: string,
  classRaw: string,
  stageRaw?: string,
): MadrasatiClass | null {
  const grade = normalizeGrade(gradeRaw);
  const className = normalizeClassName(classRaw);

  if (!grade || !className) {
    return null;
  }

  const stage = deriveStage(stageRaw, grade);
  const result: MadrasatiClass = { grade, className };

  if (stage) {
    result.stage = stage;
  }

  return result;
}

function normalizeGrade(value: string): string | undefined {
  const trimmed = value.replace(/\s+/g, " ").trim();

  if (!trimmed || /الفصل الدراسي/.test(trimmed) || !isGradeValue(trimmed)) {
    return undefined;
  }

  return trimmed.slice(0, 80);
}

function normalizeClassName(value: string): string | undefined {
  let trimmed = value
    .replace(/^(?:الشعبة|شعبة|الفصل|فصل)\s*/u, "")
    .replace(/[.|•]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed || /الفصل الدراسي/.test(trimmed) || isGradeValue(trimmed)) {
    return undefined;
  }

  if (!isClassNameValue(trimmed)) {
    return undefined;
  }

  return trimmed.slice(0, 20);
}

function isGradeValue(value: string): boolean {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || /الفصل الدراسي/.test(trimmed) || trimmed.length > 80) {
    return false;
  }

  const hasStageOrGradeWord =
    trimmed.includes("صف") || STAGE_WORDS.some((word) => trimmed.includes(word));

  return hasStageOrGradeWord && GRADE_PATTERN.test(trimmed);
}

function isClassNameValue(value: string): boolean {
  const trimmed = value
    .replace(/^(?:الشعبة|شعبة|الفصل|فصل)\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed || trimmed.length > 12 || /الفصل الدراسي/.test(trimmed)) {
    return false;
  }

  return /^(?:\d{1,3}|[أ-ي]|[أ-ي]\s*[/\-]\s*\d{1,3}|\d{1,3}\s*[/\-]\s*[أ-ي0-9]+)$/.test(
    trimmed,
  );
}

function isGradeHeader(label: string): boolean {
  const normalized = normalizeHeader(label);
  return GRADE_HEADERS.some((header) => normalizeHeader(header) === normalized);
}

function isClassHeader(label: string): boolean {
  const normalized = normalizeHeader(label);
  if (normalized === "الفصل الدراسي") {
    return false;
  }

  return CLASS_HEADERS.some((header) => normalizeHeader(header) === normalized);
}

function isStageHeader(label: string): boolean {
  const normalized = normalizeHeader(label);
  return STAGE_HEADERS.some((header) => normalizeHeader(header) === normalized);
}

function cellForHeaders(
  row: MadrasatiTableRow,
  headers: readonly string[],
): string | undefined {
  for (const wanted of headers) {
    const index = row.headers.findIndex(
      (header) => normalizeHeader(header) === normalizeHeader(wanted),
    );
    if (index >= 0) {
      const value = row.cells[index];
      if (value?.trim()) {
        return value.trim();
      }
    }
  }

  return undefined;
}

function deriveStage(
  explicit: string | undefined,
  grade: string,
): MadrasatiClass["stage"] | undefined {
  const source = `${explicit ?? ""} ${grade}`;

  if (/ثانوي/.test(source)) {
    return "secondary";
  }
  if (/متوسط/.test(source)) {
    return "intermediate";
  }
  if (/ابتدائي/.test(source)) {
    return "primary";
  }

  return undefined;
}

function isConfirmedEmptyCatalog(landmarks: MadrasatiPageLandmarks): boolean {
  if (!isCourseCatalogPage(landmarks)) {
    return false;
  }

  const haystack = `${landmarks.title}\n${landmarks.text}`;
  return EMPTY_MARKERS.some((marker) => haystack.includes(marker));
}

function isCourseCatalogPage(landmarks: MadrasatiPageLandmarks): boolean {
  const haystack = `${landmarks.title}\n${landmarks.text}\n${landmarks.accessibleNames.join("\n")}`;

  if (haystack.includes("مقرراتي")) {
    return true;
  }

  return (landmarks.tableRows ?? []).some((row) => hasCatalogHeaders(row.headers));
}

function hasCatalogHeaders(headers: readonly string[]): boolean {
  const normalized = headers.map(normalizeHeader);
  const hasGrade = GRADE_HEADERS.some((header) =>
    normalized.includes(normalizeHeader(header)),
  );
  const hasClass = CLASS_HEADERS.some((header) =>
    normalized.includes(normalizeHeader(header)),
  );

  return hasGrade && hasClass;
}

function dedupeClasses(classes: readonly MadrasatiClass[]): MadrasatiClass[] {
  const seen = new Map<string, MadrasatiClass>();

  for (const item of classes) {
    const key = `${item.grade}::${item.className}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, item);
      continue;
    }

    if (!existing.stage && item.stage) {
      seen.set(key, { ...existing, stage: item.stage });
    }
  }

  return [...seen.values()];
}

function normalizeHeader(label: string): string {
  return label.replace(/[:：]/g, "").replace(/\s+/g, " ").trim();
}
