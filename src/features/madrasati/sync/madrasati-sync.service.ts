import type {
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";
import { normalizeTimetableEntries, type RejectedTimetableEntry } from "./normalize-timetable.ts";

export interface MadrasatiSyncPreviewCounts {
  discovered: number;
  added: number;
  changed: number;
  unchanged: number;
  rejected: number;
}

export interface MadrasatiSyncResult {
  /** Always true in this foundation step — no production DB writes. */
  dryRun: true;
  /**
   * Authenticated Waraqa user that owns this sync preview.
   * Must come from server auth context — never from a client-supplied teacherId.
   */
  waraqaUserId: string;
  connection: MadrasatiConnectionStatus;
  teacher: MadrasatiTeacher | null;
  classes: MadrasatiClass[];
  subjects: MadrasatiSubject[];
  timetable: {
    accepted: MadrasatiTimetableEntry[];
    rejected: RejectedTimetableEntry[];
    duplicates: RejectedTimetableEntry[];
  };
  counts: MadrasatiSyncPreviewCounts;
  warnings: string[];
  errors: string[];
}

export interface MadrasatiSyncServiceOptions {
  /**
   * Optional baseline timetable already known to Waraqa (e.g. current teacher_timetable).
   * Used only to classify preview counts as added/changed/unchanged during dry-run.
   * Never written.
   */
  existingTimetable?: readonly MadrasatiTimetableEntry[];
}

function timetableIdentity(entry: MadrasatiTimetableEntry): string {
  return `${entry.dayOfWeek}|${entry.period}|${entry.subject}|${entry.grade}|${entry.className}|${entry.classroom ?? ""}`;
}

function slotIdentity(entry: MadrasatiTimetableEntry): string {
  return `${entry.dayOfWeek}|${entry.period}`;
}

/**
 * Dry-run Madrasati synchronization orchestration.
 *
 * Flow: connect → profile → classes → subjects → timetable → normalize → preview.
 * Does not write to the database and does not accept Madrasati login credentials.
 */
export class MadrasatiSyncService {
  private readonly provider: MadrasatiProvider;

  constructor(provider: MadrasatiProvider) {
    this.provider = provider;
  }

  async previewSync(
    waraqaUserId: string,
    options: MadrasatiSyncServiceOptions = {},
  ): Promise<MadrasatiSyncResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!waraqaUserId || typeof waraqaUserId !== "string" || !waraqaUserId.trim()) {
      throw new Error("waraqaUserId is required and must come from authenticated Waraqa context.");
    }

    const ownerId = waraqaUserId.trim();
    let connection = await this.provider.getConnectionStatus();

    if (connection.state !== "connected") {
      connection = await this.provider.connect();
    }

    if (connection.state !== "connected") {
      errors.push(connection.message || "Provider failed to connect.");
      return {
        dryRun: true,
        waraqaUserId: ownerId,
        connection,
        teacher: null,
        classes: [],
        subjects: [],
        timetable: { accepted: [], rejected: [], duplicates: [] },
        counts: {
          discovered: 0,
          added: 0,
          changed: 0,
          unchanged: 0,
          rejected: 0,
        },
        warnings,
        errors,
      };
    }

    if (connection.isMock) {
      warnings.push(
        "Using mock Madrasati provider — results are fixtures, not live Madrasati data.",
      );
    }

    let teacher: MadrasatiTeacher | null = null;
    let classes: MadrasatiClass[] = [];
    let subjects: MadrasatiSubject[] = [];
    let rawTimetable: MadrasatiTimetableEntry[] = [];

    try {
      teacher = await this.provider.getTeacherProfile();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to read teacher profile.");
    }

    try {
      classes = await this.provider.getClasses();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to read classes.");
    }

    try {
      subjects = await this.provider.getSubjects();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to read subjects.");
    }

    try {
      rawTimetable = await this.provider.getTimetable();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to read timetable.");
    }

    const normalized = normalizeTimetableEntries(rawTimetable);
    const existing = options.existingTimetable ?? [];
    const existingBySlot = new Map(existing.map((row) => [slotIdentity(row), row]));
    const existingExact = new Set(existing.map(timetableIdentity));

    let added = 0;
    let changed = 0;
    let unchanged = 0;

    for (const row of normalized.accepted) {
      const prior = existingBySlot.get(slotIdentity(row));
      if (!prior) {
        added += 1;
        continue;
      }
      if (existingExact.has(timetableIdentity(row))) {
        unchanged += 1;
      } else {
        changed += 1;
      }
    }

    warnings.push(
      ...normalized.rejected.map((r) => `Rejected timetable row (${r.reason}): ${r.message}`),
    );
    warnings.push(
      ...normalized.duplicates.map((r) => `Duplicate timetable row (${r.reason}): ${r.message}`),
    );

    return {
      dryRun: true,
      waraqaUserId: ownerId,
      connection,
      teacher,
      classes,
      subjects,
      timetable: {
        accepted: normalized.accepted,
        rejected: normalized.rejected,
        duplicates: normalized.duplicates,
      },
      counts: {
        discovered: normalized.discovered,
        added,
        changed,
        unchanged,
        rejected: normalized.rejected.length + normalized.duplicates.length,
      },
      warnings,
      errors,
    };
  }
}
