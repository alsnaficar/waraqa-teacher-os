/**
 * Pure grade/class resolution for lesson sessions and related flows.
 * Exact trimmed name match only — never fuzzy, never picks first of many.
 * Catalog arrays must already be teacher-owned (caller filters by user_id).
 */

export type CatalogGrade = {
  id: string;
  name: string;
};

export type CatalogClass = {
  id: string;
  name: string;
  gradeId: string | null;
};

export type ResolveGradeClassInput = {
  gradeId?: string | null;
  classId?: string | null;
  gradeName?: string | null;
  className?: string | null;
  grades: ReadonlyArray<CatalogGrade>;
  classes: ReadonlyArray<CatalogClass>;
};

export type ResolveGradeClassStatus =
  | "resolved"
  | "unresolved"
  | "ambiguous"
  | "mismatch"
  | "foreign";

export type ResolveGradeClassResult = {
  gradeId: string | null;
  classId: string | null;
  status: ResolveGradeClassStatus;
};

export function normalizeCatalogName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

type NameLookup<T> =
  | { kind: "none" }
  | { kind: "unique"; item: T }
  | { kind: "ambiguous" };

function findUniqueByNormalizedName<T extends { name: string }>(
  items: readonly T[],
  rawName: string | null | undefined,
): NameLookup<T> {
  const key = normalizeCatalogName(rawName);
  if (!key) return { kind: "none" };
  const matches = items.filter((item) => normalizeCatalogName(item.name) === key);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "unique", item: matches[0]! };
}

function findById<T extends { id: string }>(
  items: readonly T[],
  id: string | null | undefined,
): T | null {
  const key = id?.trim();
  if (!key) return null;
  return items.find((item) => item.id === key) ?? null;
}

/**
 * Resolve owned grade/class IDs from explicit IDs and/or exact names.
 *
 * Rules:
 * - IDs must exist in the owned catalog (else foreign).
 * - Names use trim + exact equality; duplicates → ambiguous (no guessing).
 * - When both grade and class are known, class.gradeId must match grade
 *   (unless the class has no grade binding).
 * - Unknown / ambiguous mappings leave IDs null with a non-resolved status
 *   (callers that need hard failure should throw on status !== "resolved").
 */
export function resolveOwnedGradeClassIds(
  input: ResolveGradeClassInput,
): ResolveGradeClassResult {
  const grades = input.grades;
  const classes = input.classes;

  let gradeId: string | null = null;
  let classId: string | null = null;
  let status: ResolveGradeClassStatus = "unresolved";

  const requestedGradeId = input.gradeId?.trim() || null;
  const requestedClassId = input.classId?.trim() || null;

  if (requestedGradeId) {
    const grade = findById(grades, requestedGradeId);
    if (!grade) {
      return { gradeId: null, classId: null, status: "foreign" };
    }
    gradeId = grade.id;
    status = "resolved";
  } else {
    const byName = findUniqueByNormalizedName(grades, input.gradeName);
    if (byName.kind === "ambiguous") {
      return { gradeId: null, classId: null, status: "ambiguous" };
    }
    if (byName.kind === "unique") {
      gradeId = byName.item.id;
      status = "resolved";
    }
  }

  if (requestedClassId) {
    const klass = findById(classes, requestedClassId);
    if (!klass) {
      return { gradeId: null, classId: null, status: "foreign" };
    }

    if (gradeId && klass.gradeId && klass.gradeId !== gradeId) {
      return { gradeId: null, classId: null, status: "mismatch" };
    }

    classId = klass.id;
    if (!gradeId && klass.gradeId) {
      const grade = findById(grades, klass.gradeId);
      if (!grade) {
        return { gradeId: null, classId: null, status: "foreign" };
      }
      gradeId = grade.id;
    }
    status = gradeId || classId ? "resolved" : "unresolved";
    return { gradeId, classId, status };
  }

  if (normalizeCatalogName(input.className)) {
    const scoped = gradeId
      ? classes.filter((klass) => klass.gradeId === gradeId)
      : classes;
    const byName = findUniqueByNormalizedName(scoped, input.className);
    if (byName.kind === "ambiguous") {
      return { gradeId, classId: null, status: "ambiguous" };
    }
    if (byName.kind === "none") {
      // Class name unknown under scope — keep grade if resolved; do not invent class.
      return {
        gradeId,
        classId: null,
        status: gradeId ? "resolved" : "unresolved",
      };
    }

    const klass = byName.item;
    if (gradeId && klass.gradeId && klass.gradeId !== gradeId) {
      return { gradeId: null, classId: null, status: "mismatch" };
    }

    classId = klass.id;
    if (!gradeId && klass.gradeId) {
      const grade = findById(grades, klass.gradeId);
      if (grade) gradeId = grade.id;
    }
    status = "resolved";
  }

  if (!gradeId && !classId) {
    return { gradeId: null, classId: null, status: "unresolved" };
  }

  return { gradeId, classId, status };
}

/** True when grade/class combination is consistent for persistence. */
export function assertGradeClassRelationship(
  gradeId: string | null,
  classId: string | null,
  classes: ReadonlyArray<CatalogClass>,
): void {
  if (!classId || !gradeId) return;
  const klass = findById(classes, classId);
  if (!klass) {
    throw new Error("الفصل غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
  if (klass.gradeId && klass.gradeId !== gradeId) {
    throw new Error("الفصل لا ينتمي إلى الصف المحدد.");
  }
}

export function filterClassesByGradeId(
  classes: ReadonlyArray<CatalogClass>,
  gradeId: string | null | undefined,
): CatalogClass[] {
  const key = gradeId?.trim();
  if (!key) return [...classes];
  return classes.filter((klass) => klass.gradeId === key);
}
