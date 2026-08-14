import type { MadrasatiTimetableEntry, MadrasatiTimetableEntryInput } from "../provider/models.ts";

export type TimetableRejectReason =
  | "missing_subject"
  | "missing_grade"
  | "missing_class_name"
  | "invalid_day_of_week"
  | "invalid_period"
  | "duplicate_exact"
  | "duplicate_slot";

export interface RejectedTimetableEntry {
  input: MadrasatiTimetableEntryInput;
  reason: TimetableRejectReason;
  message: string;
}

export interface NormalizedTimetableResult {
  discovered: number;
  accepted: MadrasatiTimetableEntry[];
  rejected: RejectedTimetableEntry[];
  duplicates: RejectedTimetableEntry[];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slotKey(entry: Pick<MadrasatiTimetableEntry, "dayOfWeek" | "period">): string {
  return `${entry.dayOfWeek}|${entry.period}`;
}

function exactKey(entry: MadrasatiTimetableEntry): string {
  return [
    entry.dayOfWeek,
    entry.period,
    entry.subject,
    entry.grade,
    entry.className,
    entry.classroom ?? "",
  ].join("|");
}

/**
 * Validates and deduplicates raw timetable rows.
 * Deterministic: first valid occurrence of a day+period slot wins;
 * later exact/slot duplicates are recorded separately.
 */
export function normalizeTimetableEntries(
  rows: readonly MadrasatiTimetableEntryInput[],
): NormalizedTimetableResult {
  const accepted: MadrasatiTimetableEntry[] = [];
  const rejected: RejectedTimetableEntry[] = [];
  const duplicates: RejectedTimetableEntry[] = [];
  const seenExact = new Set<string>();
  const seenSlots = new Set<string>();

  for (const input of rows) {
    const dayOfWeek = toFiniteNumber(input.dayOfWeek);
    const period = toFiniteNumber(input.period);
    const subject = normalizeText(input.subject);
    const grade = normalizeText(input.grade);
    const className = normalizeText(input.className);
    const classroom = normalizeText(input.classroom) || undefined;
    const startsAt = normalizeText(input.startsAt) || undefined;
    const endsAt = normalizeText(input.endsAt) || undefined;

    if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6 || !Number.isInteger(dayOfWeek)) {
      rejected.push({
        input,
        reason: "invalid_day_of_week",
        message: "dayOfWeek must be an integer from 0 (Sunday) to 6 (Saturday).",
      });
      continue;
    }

    if (period === null || period < 1 || !Number.isInteger(period)) {
      rejected.push({
        input,
        reason: "invalid_period",
        message: "period must be an integer >= 1.",
      });
      continue;
    }

    if (!subject) {
      rejected.push({
        input,
        reason: "missing_subject",
        message: "subject is required.",
      });
      continue;
    }

    if (!grade) {
      rejected.push({
        input,
        reason: "missing_grade",
        message: "grade is required.",
      });
      continue;
    }

    if (!className) {
      rejected.push({
        input,
        reason: "missing_class_name",
        message: "className is required.",
      });
      continue;
    }

    const entry: MadrasatiTimetableEntry = {
      dayOfWeek,
      period,
      subject,
      grade,
      className,
      ...(classroom ? { classroom } : {}),
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
    };

    const exact = exactKey(entry);
    if (seenExact.has(exact)) {
      duplicates.push({
        input,
        reason: "duplicate_exact",
        message: "Exact duplicate timetable row ignored.",
      });
      continue;
    }

    const slot = slotKey(entry);
    if (seenSlots.has(slot)) {
      duplicates.push({
        input,
        reason: "duplicate_slot",
        message: "Another entry already occupies this day/period slot; first wins.",
      });
      continue;
    }

    seenExact.add(exact);
    seenSlots.add(slot);
    accepted.push(entry);
  }

  return {
    discovered: rows.length,
    accepted,
    rejected,
    duplicates,
  };
}
