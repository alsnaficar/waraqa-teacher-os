import { sanitizePageLandmarks, type MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

export type MadrasatiCatalogRecord = {
  readonly subject?: string;
  readonly code?: string;
  readonly grade?: string;
  readonly className?: string;
  readonly stage?: string;
};

export type MadrasatiCatalogStatus = "found" | "empty" | "unavailable";

export type MadrasatiCatalogExtraction = {
  readonly status: MadrasatiCatalogStatus;
  readonly records: readonly MadrasatiCatalogRecord[];
};

export const SUBJECT_HEADERS = ["اسم المقرر", "اسم المادة", "المقرر", "المادة"] as const;
export const CODE_HEADERS = ["رمز المقرر", "رمز المادة", "كود المقرر", "رمز"] as const;
export const GRADE_HEADERS = ["الصف الدراسي", "اسم الصف", "الصف"] as const;
export const CLASS_HEADERS = ["اسم الشعبة", "الشعبة", "اسم الفصل", "الفصل"] as const;
export const STAGE_HEADERS = ["المرحلة الدراسية", "المرحلة"] as const;

const EMPTY_MARKERS = [
  "لا توجد مقررات",
  "لا يوجد مقررات",
  "لم يتم إسناد مقررات",
  "لا توجد بيانات",
] as const;

const NAV_NOISE = [
  "جدولي",
  "المقررات",
  "المقررات والمصادر",
  "مقرراتي",
  "الواجبات",
  "الاختبارات",
  "تسجيل الخروج",
  "الرئيسية",
  "الصفحة الرئيسية",
  "لوحة التحكم",
  "قائمة المدارس",
  "الإعلانات",
  "الفصول",
  "المواد",
  "الملف الشخصي",
  "تعديل بياناتي",
  "حسابي",
  "مدرستي",
  "الكادر التعليمي",
] as const;

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

const GRADE_PATTERN = new RegExp(
  `(?:الصف\\s+)?(?:${GRADE_ORDINALS.join("|")})(?:\\s+(?:${STAGE_WORDS.join("|")}))?`,
);

/**
 * Semantic course rows from a مقرراتي snapshot.
 * Never includes HTML, cookies, or Playwright objects.
 */
export function extractMadrasatiCatalogRecords(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiCatalogExtraction {
  const landmarks = sanitizePageLandmarks(snapshot);
  const collected: MadrasatiCatalogRecord[] = [];

  collectFromTableRows(landmarks.tableRows ?? [], collected);
  collectFromLabeledValues(landmarks.labeledValues, collected);
  collectFromInlineText(landmarks.text, collected);

  const records = collected.filter(
    (row) => row.subject || (row.grade && row.className) || row.code,
  );

  if (records.length > 0) {
    return { status: "found", records };
  }

  if (isConfirmedEmptyCatalog(landmarks)) {
    return { status: "empty", records: [] };
  }

  return { status: "unavailable", records: [] };
}

export function isConfirmedEmptyCatalog(landmarks: MadrasatiPageLandmarks): boolean {
  if (!isCourseCatalogPage(landmarks)) {
    return false;
  }

  const haystack = `${landmarks.title}\n${landmarks.text}`;
  return EMPTY_MARKERS.some((marker) => haystack.includes(marker));
}

export function isCourseCatalogPage(landmarks: MadrasatiPageLandmarks): boolean {
  const haystack = `${landmarks.title}\n${landmarks.text}\n${landmarks.accessibleNames.join("\n")}`;

  if (haystack.includes("مقرراتي")) {
    return true;
  }

  return (landmarks.tableRows ?? []).some((row) =>
    hasAnyHeader(row.headers, GRADE_HEADERS) && hasAnyHeader(row.headers, CLASS_HEADERS),
  );
}

export function normalizeHeader(label: string): string {
  return label.replace(/[:：]/g, "").replace(/\s+/g, " ").trim();
}

export function isSubjectName(value: string): boolean {
  const trimmed = collapse(value);
  if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
    return false;
  }

  if (NAV_NOISE.some((item) => trimmed === item || trimmed.includes(item))) {
    return false;
  }

  if (/الفصل الدراسي/.test(trimmed) || isGradeValue(trimmed) || isClassNameValue(trimmed)) {
    return false;
  }

  if (STAGE_WORDS.some((word) => trimmed === word || trimmed === word.replace(/^ال/, ""))) {
    return false;
  }

  if (SUBJECT_HEADERS.some((header) => normalizeHeader(trimmed) === normalizeHeader(header))) {
    return false;
  }

  return /[\u0600-\u06FFa-zA-Z]/.test(trimmed);
}

export function isGradeValue(value: string): boolean {
  const trimmed = collapse(value);
  if (!trimmed || /الفصل الدراسي/.test(trimmed) || trimmed.length > 80) {
    return false;
  }

  const hasStageOrGradeWord =
    trimmed.includes("صف") || STAGE_WORDS.some((word) => trimmed.includes(word));

  return hasStageOrGradeWord && GRADE_PATTERN.test(trimmed);
}

/** Longest explicit grade phrase inside a timetable/catalog blob. */
export function findGradeInText(value: string): string | undefined {
  const trimmed = collapse(value);
  if (!trimmed || /الفصل الدراسي/.test(trimmed)) {
    return undefined;
  }

  const matches = [...trimmed.matchAll(new RegExp(GRADE_PATTERN, "g"))]
    .map((match) => collapse(match[0] ?? ""))
    .filter((grade) => isGradeValue(grade));

  if (matches.length === 0) {
    return undefined;
  }

  return matches.sort((left, right) => right.length - left.length)[0];
}

export function isClassNameValue(value: string): boolean {
  const trimmed = collapse(value).replace(/^(?:الشعبة|شعبة|الفصل|فصل)\s*/u, "");

  if (!trimmed || trimmed.length > 12 || /الفصل الدراسي/.test(trimmed)) {
    return false;
  }

  return /^(?:\d{1,3}|[أ-ي]|[أ-ي]\s*[/\-]\s*\d{1,3}|\d{1,3}\s*[/\-]\s*[أ-ي0-9]+)$/.test(
    trimmed,
  );
}

function collectFromTableRows(
  rows: MadrasatiPageLandmarks["tableRows"],
  collected: MadrasatiCatalogRecord[],
): void {
  for (const row of rows ?? []) {
    const subject = normalizeSubject(cellForHeaders(row.headers, row.cells, SUBJECT_HEADERS));
    const code = normalizeCode(cellForHeaders(row.headers, row.cells, CODE_HEADERS));
    const grade = cellForHeaders(row.headers, row.cells, GRADE_HEADERS);
    const className = cellForHeaders(row.headers, row.cells, CLASS_HEADERS);
    const stage = cellForHeaders(row.headers, row.cells, STAGE_HEADERS);

    let resolvedGrade = grade;
    let resolvedClass = className;
    let resolvedSubject = subject;

    if (!resolvedGrade || !resolvedClass) {
      for (const cell of row.cells) {
        if (!resolvedGrade && isGradeValue(cell) && !isClassNameValue(cell)) {
          resolvedGrade = cell;
          continue;
        }
        if (!resolvedClass && isClassNameValue(cell) && !isGradeValue(cell)) {
          resolvedClass = cell;
        }
      }
    }

    if (!resolvedSubject) {
      for (const cell of row.cells) {
        if (
          cell !== resolvedGrade &&
          cell !== resolvedClass &&
          cell !== stage &&
          isSubjectName(cell)
        ) {
          resolvedSubject = normalizeSubject(cell);
          break;
        }
      }
    }

    collected.push({
      ...(resolvedSubject ? { subject: resolvedSubject } : {}),
      ...(code ? { code } : {}),
      ...(resolvedGrade ? { grade: collapse(resolvedGrade) } : {}),
      ...(resolvedClass ? { className: collapse(resolvedClass) } : {}),
      ...(stage ? { stage: collapse(stage) } : {}),
    });
  }
}

function collectFromLabeledValues(
  rows: MadrasatiPageLandmarks["labeledValues"],
  collected: MadrasatiCatalogRecord[],
): void {
  const used = new Set<number>();

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    if (!current || used.has(index)) {
      continue;
    }

    if (!isHeader(current.label, SUBJECT_HEADERS) && !isHeader(current.label, GRADE_HEADERS)) {
      continue;
    }

    const start = isHeader(current.label, SUBJECT_HEADERS) ? index : Math.max(0, index - 2);
    const record: {
      subject?: string;
      code?: string;
      grade?: string;
      className?: string;
      stage?: string;
    } = {};

    for (let cursor = start; cursor < Math.min(rows.length, start + 6); cursor += 1) {
      const row = rows[cursor];
      if (!row || used.has(cursor)) {
        continue;
      }

      if (isHeader(row.label, SUBJECT_HEADERS) && isSubjectName(row.value)) {
        record.subject = normalizeSubject(row.value);
        used.add(cursor);
      } else if (isHeader(row.label, CODE_HEADERS)) {
        const code = normalizeCode(row.value);
        if (code) {
          record.code = code;
          used.add(cursor);
        }
      } else if (isHeader(row.label, GRADE_HEADERS)) {
        record.grade = collapse(row.value);
        used.add(cursor);
      } else if (isHeader(row.label, CLASS_HEADERS) && normalizeHeader(row.label) !== "الفصل الدراسي") {
        record.className = collapse(row.value);
        used.add(cursor);
      } else if (isHeader(row.label, STAGE_HEADERS)) {
        record.stage = collapse(row.value);
        used.add(cursor);
      }
    }

    if (record.subject || (record.grade && record.className) || record.code) {
      collected.push(record);
    }
  }
}

function collectFromInlineText(text: string, collected: MadrasatiCatalogRecord[]): void {
  const lines = text
    .split(/\n/)
    .map((line) => collapse(line))
    .filter(Boolean);

  const labeled: Array<{ label: string; value: string }> = [];

  for (const line of lines) {
    const match = line.match(
      /^(اسم المقرر|اسم المادة|المقرر|المادة|رمز المقرر|رمز المادة|كود المقرر|رمز|الصف الدراسي|اسم الصف|الصف|اسم الشعبة|الشعبة|اسم الفصل|الفصل|المرحلة الدراسية|المرحلة)\s*[:：]\s*(.+)$/,
    );
    if (!match?.[1] || !match[2] || normalizeHeader(match[1]) === "الفصل الدراسي") {
      continue;
    }
    labeled.push({ label: match[1], value: match[2] });
  }

  collectFromLabeledValues(labeled, collected);
}

function cellForHeaders(
  headers: readonly string[],
  cells: readonly string[],
  wanted: readonly string[],
): string | undefined {
  for (const header of wanted) {
    const index = headers.findIndex(
      (item) => normalizeHeader(item) === normalizeHeader(header),
    );
    if (index >= 0) {
      const value = cells[index];
      if (value?.trim()) {
        return value.trim();
      }
    }
  }

  return undefined;
}

function isHeader(label: string, headers: readonly string[]): boolean {
  const normalized = normalizeHeader(label);
  return headers.some((header) => normalizeHeader(header) === normalized);
}

function hasAnyHeader(headers: readonly string[], wanted: readonly string[]): boolean {
  const normalized = headers.map(normalizeHeader);
  return wanted.some((header) => normalized.includes(normalizeHeader(header)));
}

function normalizeSubject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = collapse(value);
  return isSubjectName(trimmed) ? trimmed.slice(0, 80) : undefined;
}

function normalizeCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = collapse(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/.test(trimmed) || /^\d{10}$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
