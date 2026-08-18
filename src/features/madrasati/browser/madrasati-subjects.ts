import type { MadrasatiSubject } from "../provider/models.ts";
import { extractMadrasatiCatalogRecords } from "./madrasati-catalog.ts";
import type { MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

export const MADRASATI_SUBJECTS_UNAVAILABLE_CODE = "SUBJECTS_UNAVAILABLE" as const;

export const MADRASATI_SUBJECTS_UNAVAILABLE_MESSAGE =
  "تعذر قراءة المواد من صفحة المقررات في مدرستي.";

export type MadrasatiSubjectExtractionStatus = "found" | "empty" | "unavailable";

export type MadrasatiSubjectExtraction = {
  readonly status: MadrasatiSubjectExtractionStatus;
  readonly subjects: readonly MadrasatiSubject[];
};

/**
 * Maps a مقرراتي snapshot to unique assigned subjects.
 * Fail-closed unless subject names can be read or the catalog is confirmed empty.
 */
export function extractMadrasatiSubjects(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiSubjectExtraction {
  const catalog = extractMadrasatiCatalogRecords(snapshot);

  if (catalog.status === "empty") {
    return { status: "empty", subjects: [] };
  }

  if (catalog.status === "unavailable") {
    return { status: "unavailable", subjects: [] };
  }

  const subjects = dedupeSubjects(
    catalog.records
      .map((record) => toSubject(record.subject, record.code))
      .filter((item): item is MadrasatiSubject => item !== null),
  );

  if (subjects.length > 0) {
    return { status: "found", subjects };
  }

  return { status: "unavailable", subjects: [] };
}

function toSubject(name: string | undefined, code: string | undefined): MadrasatiSubject | null {
  if (!name) {
    return null;
  }

  return code ? { name, code } : { name };
}

function dedupeSubjects(subjects: readonly MadrasatiSubject[]): MadrasatiSubject[] {
  const seen = new Map<string, MadrasatiSubject>();

  for (const item of subjects) {
    const key = item.name.toLocaleLowerCase("ar");
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, item);
      continue;
    }

    if (!existing.code && item.code) {
      seen.set(key, { ...existing, code: item.code });
    }
  }

  return [...seen.values()];
}
