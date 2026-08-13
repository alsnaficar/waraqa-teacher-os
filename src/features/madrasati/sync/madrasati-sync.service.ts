import type {
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";
import { normalizeTimetableEntries, type RejectedTimetableEntry } from "./normalize-timetable.ts";
import {
  mapMadrasatiTimetableToTeacherDrafts,
  type TeacherTimetableDraft,
} from "./map-to-teacher-timetable.ts";

export const MADRASATI_APPLY_EMPTY_CODE = "MADRASATI_APPLY_EMPTY_TIMETABLE" as const;
export const MADRASATI_APPLY_INCOMPLETE_CODE = "MADRASATI_APPLY_INCOMPLETE_SNAPSHOT" as const;
export const MADRASATI_APPLY_NOT_MOCK_CODE = "MADRASATI_APPLY_NOT_MOCK" as const;

export const MADRASATI_APPLY_EMPTY_MESSAGE =
  "لا يمكن تطبيق جدول فارغ تلقائياً — لم يتم حذف أو تعديل الجدول الحالي.";

export const MADRASATI_APPLY_INCOMPLETE_MESSAGE =
  "مصدر الجدول غير مكتمل أو غير موثوق — لم يتم تطبيق أو حذف الجدول الحالي.";

export const MADRASATI_APPLY_NOT_MOCK_MESSAGE =
  "تطبيق الجدول متاح حالياً لمزود الاختبار فقط — لم يتم تعديل الجدول.";

export const MADRASATI_MOCK_APPLY_DISCLAIMER =
  "هذه عملية تطبيق تجريبية باستخدام بيانات اختبار، وليست مزامنة فعلية مع منصة مدرستي.";

/** Minimal auth context required for apply — must match requireSupabaseAuth context. */
export interface MadrasatiApplyAuthContext {
  userId: string;
  client: unknown;
}

export type SaveTeacherTimetableFn = (
  entries: TeacherTimetableDraft[],
  auth: MadrasatiApplyAuthContext,
) => Promise<void>;

export interface MadrasatiSyncPreviewCounts {
  discovered: number;
  added: number;
  changed: number;
  unchanged: number;
  rejected: number;
}

export interface MadrasatiSyncResult {
  /** Always true for preview — no production DB writes. */
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

export type MadrasatiApplyFailureCode =
  | typeof MADRASATI_APPLY_EMPTY_CODE
  | typeof MADRASATI_APPLY_INCOMPLETE_CODE
  | typeof MADRASATI_APPLY_NOT_MOCK_CODE;

export type MadrasatiApplyResult =
  | {
      success: true;
      dryRun: false;
      isMockApply: true;
      disclaimer: string;
      waraqaUserId: string;
      slotsWritten: number;
      connection: MadrasatiConnectionStatus;
      timetable: {
        accepted: MadrasatiTimetableEntry[];
        rejected: RejectedTimetableEntry[];
        duplicates: RejectedTimetableEntry[];
      };
      warnings: string[];
    }
  | {
      success: false;
      dryRun: false;
      isMockApply: true;
      disclaimer: string;
      waraqaUserId: string;
      slotsWritten: 0;
      code: MadrasatiApplyFailureCode;
      message: string;
      connection: MadrasatiConnectionStatus;
      timetable: {
        accepted: MadrasatiTimetableEntry[];
        rejected: RejectedTimetableEntry[];
        duplicates: RejectedTimetableEntry[];
      };
      warnings: string[];
      errors: string[];
    };

export interface MadrasatiSyncServiceOptions {
  /**
   * Optional baseline timetable already known to Waraqa (e.g. current teacher_timetable).
   * Used only to classify preview counts as added/changed/unchanged during dry-run.
   * Never written.
   */
  existingTimetable?: readonly MadrasatiTimetableEntry[];
}

export interface MadrasatiApplyOptions {
  /** Injected for tests; production uses TeacherTimetableService.saveTimetable. */
  saveTimetable?: SaveTeacherTimetableFn;
}

function timetableIdentity(entry: MadrasatiTimetableEntry): string {
  return `${entry.dayOfWeek}|${entry.period}|${entry.subject}|${entry.grade}|${entry.className}|${entry.classroom ?? ""}`;
}

function slotIdentity(entry: MadrasatiTimetableEntry): string {
  return `${entry.dayOfWeek}|${entry.period}`;
}

type CollectedSnapshot = {
  connection: MadrasatiConnectionStatus;
  teacher: MadrasatiTeacher | null;
  classes: MadrasatiClass[];
  subjects: MadrasatiSubject[];
  rawTimetable: MadrasatiTimetableEntry[];
  warnings: string[];
  errors: string[];
  /** True only when provider connected as mock and timetable read did not error. */
  sourceComplete: boolean;
};

async function defaultSaveTeacherTimetable(
  entries: TeacherTimetableDraft[],
  auth: MadrasatiApplyAuthContext,
): Promise<void> {
  const { TeacherTimetableService } =
    await import("../../teacher-timetable/services/teacher-timetable.service.ts");
  await TeacherTimetableService.saveTimetable(entries, {
    client: auth.client as never,
    userId: auth.userId,
  });
}

/**
 * Madrasati sync orchestration.
 *
 * - previewSync: dry-run only
 * - applyMockTimetable: mock-only full weekly replace into teacher_timetable
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
    if (!waraqaUserId || typeof waraqaUserId !== "string" || !waraqaUserId.trim()) {
      throw new Error("waraqaUserId is required and must come from authenticated Waraqa context.");
    }

    const ownerId = waraqaUserId.trim();
    const collected = await this.collectSnapshot();
    const normalized = normalizeTimetableEntries(collected.rawTimetable);
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

    const warnings = [
      ...collected.warnings,
      ...normalized.rejected.map((r) => `Rejected timetable row (${r.reason}): ${r.message}`),
      ...normalized.duplicates.map((r) => `Duplicate timetable row (${r.reason}): ${r.message}`),
    ];

    return {
      dryRun: true,
      waraqaUserId: ownerId,
      connection: collected.connection,
      teacher: collected.teacher,
      classes: collected.classes,
      subjects: collected.subjects,
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
      errors: collected.errors,
    };
  }

  /**
   * Mock-only persistence: full weekly replace of teacher_timetable.
   * Refuses empty and incomplete snapshots without calling saveTimetable.
   * Does not touch lesson_sessions.
   */
  async applyMockTimetable(
    waraqaUserId: string,
    auth: MadrasatiApplyAuthContext,
    options: MadrasatiApplyOptions = {},
  ): Promise<MadrasatiApplyResult> {
    if (!waraqaUserId || typeof waraqaUserId !== "string" || !waraqaUserId.trim()) {
      throw new Error("waraqaUserId is required and must come from authenticated Waraqa context.");
    }
    if (!auth?.userId || auth.userId.trim() !== waraqaUserId.trim()) {
      throw new Error("Authenticated user mismatch: apply owner must equal context.userId.");
    }
    if (!auth.client) {
      throw new Error("Authenticated Supabase client is required for timetable apply.");
    }

    const ownerId = waraqaUserId.trim();
    const collected = await this.collectSnapshot();
    const normalized = normalizeTimetableEntries(collected.rawTimetable);
    const warnings = [
      ...collected.warnings,
      ...normalized.rejected.map((r) => `Rejected timetable row (${r.reason}): ${r.message}`),
      ...normalized.duplicates.map((r) => `Duplicate timetable row (${r.reason}): ${r.message}`),
    ];

    const timetable = {
      accepted: normalized.accepted,
      rejected: normalized.rejected,
      duplicates: normalized.duplicates,
    };

    if (!collected.connection.isMock) {
      return {
        success: false,
        dryRun: false,
        isMockApply: true,
        disclaimer: MADRASATI_MOCK_APPLY_DISCLAIMER,
        waraqaUserId: ownerId,
        slotsWritten: 0,
        code: MADRASATI_APPLY_NOT_MOCK_CODE,
        message: MADRASATI_APPLY_NOT_MOCK_MESSAGE,
        connection: collected.connection,
        timetable,
        warnings,
        errors: collected.errors,
      };
    }

    // Fail closed: provider models have no explicit "partial snapshot" flag.
    // Incomplete = not connected as a trusted mock read, or timetable read errored.
    if (!collected.sourceComplete || collected.connection.state !== "connected") {
      return {
        success: false,
        dryRun: false,
        isMockApply: true,
        disclaimer: MADRASATI_MOCK_APPLY_DISCLAIMER,
        waraqaUserId: ownerId,
        slotsWritten: 0,
        code: MADRASATI_APPLY_INCOMPLETE_CODE,
        message: MADRASATI_APPLY_INCOMPLETE_MESSAGE,
        connection: collected.connection,
        timetable,
        warnings,
        errors: collected.errors,
      };
    }

    if (normalized.accepted.length === 0) {
      return {
        success: false,
        dryRun: false,
        isMockApply: true,
        disclaimer: MADRASATI_MOCK_APPLY_DISCLAIMER,
        waraqaUserId: ownerId,
        slotsWritten: 0,
        code: MADRASATI_APPLY_EMPTY_CODE,
        message: MADRASATI_APPLY_EMPTY_MESSAGE,
        connection: collected.connection,
        timetable,
        warnings,
        errors: collected.errors,
      };
    }

    const drafts = mapMadrasatiTimetableToTeacherDrafts(normalized.accepted);
    const save = options.saveTimetable ?? defaultSaveTeacherTimetable;
    await save(drafts, { userId: ownerId, client: auth.client });

    return {
      success: true,
      dryRun: false,
      isMockApply: true,
      disclaimer: MADRASATI_MOCK_APPLY_DISCLAIMER,
      waraqaUserId: ownerId,
      slotsWritten: drafts.length,
      connection: collected.connection,
      timetable,
      warnings,
    };
  }

  private async collectSnapshot(): Promise<CollectedSnapshot> {
    const warnings: string[] = [];
    const errors: string[] = [];

    let connection = await this.provider.getConnectionStatus();

    if (connection.state !== "connected") {
      connection = await this.provider.connect();
    }

    if (connection.state !== "connected") {
      errors.push(connection.message || "Provider failed to connect.");
      return {
        connection,
        teacher: null,
        classes: [],
        subjects: [],
        rawTimetable: [],
        warnings,
        errors,
        sourceComplete: false,
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
    let timetableReadOk = false;

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
      timetableReadOk = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to read timetable.");
      timetableReadOk = false;
    }

    const sourceComplete = connection.isMock && connection.state === "connected" && timetableReadOk;

    return {
      connection,
      teacher,
      classes,
      subjects,
      rawTimetable,
      warnings,
      errors,
      sourceComplete,
    };
  }
}
