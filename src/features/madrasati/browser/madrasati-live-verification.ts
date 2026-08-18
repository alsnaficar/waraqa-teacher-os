import type {
  MadrasatiClass,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import { MadrasatiProviderError } from "../provider/madrasati-provider.ts";
import {
  MOCK_MADRASATI_TEACHER,
  MOCK_MADRASATI_TIMETABLE,
} from "../mock/fixtures.ts";

export type MadrasatiExtractionSuccess<T> = {
  readonly success: true;
  readonly data: T;
  readonly empty?: boolean;
};

export type MadrasatiExtractionFailure = {
  readonly success: false;
  readonly code: string;
  readonly message: string;
};

export type MadrasatiExtractionResult<T> =
  | MadrasatiExtractionSuccess<T>
  | MadrasatiExtractionFailure;

export type MadrasatiLiveTeacherSnapshot = {
  readonly displayName: string;
  readonly schoolName?: string;
  readonly academicYear?: string;
  readonly semester?: string;
};

export type MadrasatiLiveClassSnapshot = {
  readonly grade: string;
  readonly className: string;
  readonly stage?: string;
};

export type MadrasatiLiveSubjectSnapshot = {
  readonly name: string;
  readonly code?: string;
};

export type MadrasatiLiveTimetableSnapshot = {
  readonly dayOfWeek: number;
  readonly period: number;
  readonly subject: string;
  readonly grade: string;
  readonly className: string;
  readonly classroom?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
};

export type MadrasatiTimetableValidation = {
  readonly invalidDayCount: number;
  readonly invalidPeriodCount: number;
  readonly missingSubjectCount: number;
  readonly missingGradeCount: number;
  readonly missingClassCount: number;
  readonly duplicateCount: number;
  readonly semesterAsClassNameCount: number;
};

export type MadrasatiLiveVerificationReport = {
  readonly authenticated: boolean;
  readonly connection: "LIVE" | "MOCK";
  readonly isMock: boolean;
  readonly stoppedBecauseMock: boolean;
  readonly teacher: MadrasatiExtractionResult<MadrasatiLiveTeacherSnapshot>;
  readonly classes: MadrasatiExtractionResult<readonly MadrasatiLiveClassSnapshot[]>;
  readonly subjects: MadrasatiExtractionResult<readonly MadrasatiLiveSubjectSnapshot[]>;
  readonly timetable: MadrasatiExtractionResult<readonly MadrasatiLiveTimetableSnapshot[]>;
  readonly timetableValidation: MadrasatiTimetableValidation;
  readonly session: {
    readonly existedBefore: boolean;
    readonly remainedAlive: boolean;
    readonly remainedAuthenticated: boolean;
    readonly secondSessionCreated: boolean;
  };
  readonly databaseWrites: "NONE";
};

const EMPTY_TIMETABLE_VALIDATION: MadrasatiTimetableValidation = {
  invalidDayCount: 0,
  invalidPeriodCount: 0,
  missingSubjectCount: 0,
  missingGradeCount: 0,
  missingClassCount: 0,
  duplicateCount: 0,
  semesterAsClassNameCount: 0,
};

const SESSION_NOT_FOUND_MESSAGE =
  "لا توجد جلسة متصفح مدرستي مفتوحة لهذا المستخدم. سجّل الدخول إلى مدرستي أولاً.";

function collapse(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function toExtractionFailure(error: unknown): MadrasatiExtractionFailure {
  if (error instanceof MadrasatiProviderError) {
    return {
      success: false,
      code: error.code,
      message: collapse(error.message) || "تعذر إكمال استخراج مدرستي.",
    };
  }

  if (error instanceof Error) {
    const message = collapse(error.message);
    const code = /not found|expired/i.test(message)
      ? "SESSION_NOT_FOUND"
      : "EXTRACTION_FAILED";
    return {
      success: false,
      code,
      message: message || "تعذر إكمال استخراج مدرستي.",
    };
  }

  return {
    success: false,
    code: "EXTRACTION_FAILED",
    message: "تعذر إكمال استخراج مدرستي.",
  };
}

export function sanitizeTeacherSnapshot(
  teacher: MadrasatiTeacher,
): MadrasatiLiveTeacherSnapshot | null {
  const displayName = collapse(teacher.displayName);
  if (!displayName) {
    return null;
  }

  return {
    displayName,
    ...(collapse(teacher.schoolName) ? { schoolName: collapse(teacher.schoolName) } : {}),
    ...(collapse(teacher.academicYear)
      ? { academicYear: collapse(teacher.academicYear) }
      : {}),
    ...(collapse(teacher.semester) ? { semester: collapse(teacher.semester) } : {}),
  };
}

export function sanitizeClassSnapshots(
  classes: readonly MadrasatiClass[],
): MadrasatiLiveClassSnapshot[] {
  return classes.map((item) => ({
    grade: collapse(item.grade),
    className: collapse(item.className),
    ...(collapse(item.stage) ? { stage: collapse(item.stage) } : {}),
  }));
}

export function sanitizeSubjectSnapshots(
  subjects: readonly MadrasatiSubject[],
): MadrasatiLiveSubjectSnapshot[] {
  return subjects.map((item) => ({
    name: collapse(item.name),
    ...(collapse(item.code) ? { code: collapse(item.code) } : {}),
  }));
}

export function sanitizeTimetableSnapshots(
  entries: readonly MadrasatiTimetableEntry[],
): MadrasatiLiveTimetableSnapshot[] {
  return entries.map((item) => ({
    dayOfWeek: item.dayOfWeek,
    period: item.period,
    subject: collapse(item.subject),
    grade: collapse(item.grade),
    className: collapse(item.className),
    ...(collapse(item.classroom) ? { classroom: collapse(item.classroom) } : {}),
    ...(collapse(item.startsAt) ? { startsAt: collapse(item.startsAt) } : {}),
    ...(collapse(item.endsAt) ? { endsAt: collapse(item.endsAt) } : {}),
  }));
}

export function validateTimetableSnapshots(
  entries: readonly MadrasatiLiveTimetableSnapshot[],
): MadrasatiTimetableValidation {
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const entry of entries) {
    const identity = [
      entry.dayOfWeek,
      entry.period,
      entry.subject,
      entry.grade,
      entry.className,
      entry.classroom ?? "",
    ].join("|");
    if (seen.has(identity)) {
      duplicateCount += 1;
    } else {
      seen.add(identity);
    }
  }

  return {
    invalidDayCount: entries.filter(
      (entry) =>
        !Number.isInteger(entry.dayOfWeek) || entry.dayOfWeek < 0 || entry.dayOfWeek > 6,
    ).length,
    invalidPeriodCount: entries.filter(
      (entry) => !Number.isInteger(entry.period) || entry.period < 1 || entry.period > 12,
    ).length,
    missingSubjectCount: entries.filter((entry) => !entry.subject).length,
    missingGradeCount: entries.filter((entry) => !entry.grade).length,
    missingClassCount: entries.filter((entry) => !entry.className).length,
    duplicateCount,
    semesterAsClassNameCount: entries.filter((entry) =>
      /الفصل الدراسي/.test(entry.className),
    ).length,
  };
}

export function matchesMockFixtures(input: {
  readonly teacher?: MadrasatiLiveTeacherSnapshot;
  readonly timetable?: readonly MadrasatiLiveTimetableSnapshot[];
}): boolean {
  const teacherIsMock =
    input.teacher?.displayName === MOCK_MADRASATI_TEACHER.displayName &&
    input.teacher.schoolName === MOCK_MADRASATI_TEACHER.schoolName;

  const timetableIsMock =
    (input.timetable?.length ?? 0) === MOCK_MADRASATI_TIMETABLE.length &&
    JSON.stringify(input.timetable) ===
      JSON.stringify(
        sanitizeTimetableSnapshots(MOCK_MADRASATI_TIMETABLE),
      );

  return Boolean(teacherIsMock || timetableIsMock);
}

export function extractionFromValue<T>(
  data: T,
  isEmpty: boolean,
): MadrasatiExtractionSuccess<T> {
  return isEmpty ? { success: true, data, empty: true } : { success: true, data };
}

export function buildMissingSessionReport(): MadrasatiLiveVerificationReport {
  const missing: MadrasatiExtractionFailure = {
    success: false,
    code: "SESSION_NOT_FOUND",
    message: SESSION_NOT_FOUND_MESSAGE,
  };

  return {
    authenticated: false,
    connection: "LIVE",
    isMock: false,
    stoppedBecauseMock: false,
    teacher: missing,
    classes: missing,
    subjects: missing,
    timetable: missing,
    timetableValidation: EMPTY_TIMETABLE_VALIDATION,
    session: {
      existedBefore: false,
      remainedAlive: false,
      remainedAuthenticated: false,
      secondSessionCreated: false,
    },
    databaseWrites: "NONE",
  };
}

export function buildMockSessionStopReport(existedBefore: boolean): MadrasatiLiveVerificationReport {
  const stopped: MadrasatiExtractionFailure = {
    success: false,
    code: "MOCK_SESSION",
    message: "LIVE MADRASATI SESSION WAS NOT USED.",
  };

  return {
    authenticated: false,
    connection: "MOCK",
    isMock: true,
    stoppedBecauseMock: true,
    teacher: stopped,
    classes: stopped,
    subjects: stopped,
    timetable: stopped,
    timetableValidation: EMPTY_TIMETABLE_VALIDATION,
    session: {
      existedBefore,
      remainedAlive: existedBefore,
      remainedAuthenticated: false,
      secondSessionCreated: false,
    },
    databaseWrites: "NONE",
  };
}

export function logLiveVerificationSummary(report: MadrasatiLiveVerificationReport): void {
  console.info("[madrasati-live-verification]", {
    connection: report.connection,
    authenticated: report.authenticated,
    isMock: report.isMock,
    stoppedBecauseMock: report.stoppedBecauseMock,
    teacher: {
      success: report.teacher.success,
      displayNamePresent:
        report.teacher.success && Boolean(report.teacher.data.displayName),
      schoolPresent: report.teacher.success && Boolean(report.teacher.data.schoolName),
    },
    classes: {
      success: report.classes.success,
      count: report.classes.success ? report.classes.data.length : undefined,
      empty: report.classes.success ? report.classes.empty === true : undefined,
    },
    subjects: {
      success: report.subjects.success,
      count: report.subjects.success ? report.subjects.data.length : undefined,
      empty: report.subjects.success ? report.subjects.empty === true : undefined,
    },
    timetable: {
      success: report.timetable.success,
      count: report.timetable.success ? report.timetable.data.length : undefined,
      empty: report.timetable.success ? report.timetable.empty === true : undefined,
      validation: report.timetableValidation,
    },
    session: report.session,
    databaseWrites: report.databaseWrites,
  });
}

export { EMPTY_TIMETABLE_VALIDATION };
