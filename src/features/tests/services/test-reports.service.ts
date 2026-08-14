import {
  resolveReportsDateRange,
  type ReportsDateFilter,
} from "@/features/reports/services/reports.service";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import { toTestStatus, type TestStatus } from "./test.service";
import {
  toTestSubmissionStatus,
  type TestSubmissionStatus,
} from "./test-submission.service";

/**
 * Period filtering uses tests.due_date (inclusive YYYY-MM-DD).
 * Tests with null due_date are excluded from period summaries — same convention
 * as HomeworkReportsService (no alternate period field invented).
 *
 * expectedSubmissions = count of submission rows for tests in the period.
 */

export type TestReportSummary = {
  totalTests: number;
  draftTests: number;
  publishedTests: number;
  closedTests: number;
  /** Active students on the teacher roster (not period-scoped). */
  totalStudents: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  submittedSubmissions: number;
  gradedSubmissions: number;
  /**
   * expectedSubmissions = totalSubmissions (tracked rows only).
   * completionRate = round((submitted + graded) / expected * 100), else 0.
   */
  expectedSubmissions: number;
  completionRate: number;
  /**
   * gradingRate = round(graded / (submitted + graded) * 100), else 0.
   * Denominator is submissions that reached a delivered state (submitted|graded).
   */
  gradingRate: number;
  /**
   * Mean of numeric scores among graded submissions with a non-null score.
   * 0 when there are no scored graded rows.
   */
  averageScore: number;
};

export type TestReportListItem = {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: TestStatus;
};

export type TestPeriodReport = {
  range: { from: string; to: string };
  summary: TestReportSummary;
  tests: TestReportListItem[];
};

export type TestStudentPerformanceRow = {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  status: TestSubmissionStatus;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
};

export type TestDetailReport = {
  testId: string;
  title: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: TestStatus;
  /** Students with a submission row for this test. */
  numberOfStudents: number;
  submittedCount: number;
  gradedCount: number;
  averageScore: number;
  students: TestStudentPerformanceRow[];
};

type TestRowLite = {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  class_name: string | null;
  due_date: string | null;
  status: string;
  teacher_id: string;
};

type SubmissionRowLite = {
  id: string;
  test_id: string;
  student_id: string;
  status: string;
  score: number | null;
  max_score: number | null;
  feedback: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  teacher_id: string;
};

type StudentRowLite = {
  id: string;
  full_name: string;
  student_code: string | null;
  active: boolean;
  teacher_id: string;
};

export function isTestDueInRange(
  dueDate: string | null,
  range: { from: string; to: string },
): boolean {
  if (!dueDate) return false;
  return dueDate >= range.from && dueDate <= range.to;
}

export function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function averageNumericScores(scores: Array<number | null | undefined>): number {
  const values = scores.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function computeTestReportSummary(input: {
  tests: Array<{ status: string }>;
  submissions: Array<{ status: string; score: number | null }>;
  activeStudentCount: number;
}): TestReportSummary {
  const totalTests = input.tests.length;
  let draftTests = 0;
  let publishedTests = 0;
  let closedTests = 0;

  for (const row of input.tests) {
    const status = toTestStatus(row.status);
    if (status === "draft") draftTests += 1;
    else if (status === "published") publishedTests += 1;
    else if (status === "closed") closedTests += 1;
  }

  let pendingSubmissions = 0;
  let submittedSubmissions = 0;
  let gradedSubmissions = 0;
  const gradedScores: number[] = [];

  for (const row of input.submissions) {
    const status = toTestSubmissionStatus(row.status);
    if (status === "pending") pendingSubmissions += 1;
    else if (status === "submitted") submittedSubmissions += 1;
    else if (status === "graded") {
      gradedSubmissions += 1;
      if (row.score != null && Number.isFinite(row.score)) gradedScores.push(row.score);
    }
  }

  const totalSubmissions = pendingSubmissions + submittedSubmissions + gradedSubmissions;
  const expectedSubmissions = totalSubmissions;
  const delivered = submittedSubmissions + gradedSubmissions;

  return {
    totalTests,
    draftTests,
    publishedTests,
    closedTests,
    totalStudents: input.activeStudentCount,
    totalSubmissions,
    pendingSubmissions,
    submittedSubmissions,
    gradedSubmissions,
    expectedSubmissions,
    completionRate: ratePercent(delivered, expectedSubmissions),
    gradingRate: ratePercent(gradedSubmissions, delivered),
    averageScore: averageNumericScores(gradedScores),
  };
}

export function computeTestDetail(input: {
  test: TestRowLite;
  submissions: SubmissionRowLite[];
  studentsById: Map<string, StudentRowLite>;
}): TestDetailReport {
  let submittedCount = 0;
  let gradedCount = 0;
  const gradedScores: number[] = [];

  const students: TestStudentPerformanceRow[] = input.submissions.map((row) => {
    const status = toTestSubmissionStatus(row.status);
    if (status === "submitted") submittedCount += 1;
    if (status === "graded") {
      gradedCount += 1;
      if (row.score != null && Number.isFinite(Number(row.score))) {
        gradedScores.push(Number(row.score));
      }
    }
    const student = input.studentsById.get(row.student_id);
    return {
      studentId: row.student_id,
      studentName: student?.full_name ?? "طالب غير معروف",
      studentCode: student?.student_code ?? null,
      status,
      score: row.score == null ? null : Number(row.score),
      maxScore: row.max_score == null ? null : Number(row.max_score),
      feedback: row.feedback,
      submittedAt: row.submitted_at,
      gradedAt: row.graded_at,
    };
  });

  students.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"));

  return {
    testId: input.test.id,
    title: input.test.title,
    subject: input.test.subject,
    grade: input.test.grade,
    className: input.test.class_name,
    dueDate: input.test.due_date,
    status: toTestStatus(input.test.status),
    numberOfStudents: students.length,
    submittedCount,
    gradedCount,
    averageScore: averageNumericScores(gradedScores),
    students,
  };
}

/**
 * Read-only test reports. Teacher scope via resolveUserContext only.
 */
export class TestReportsService {
  static async getPeriodReport(
    filter: ReportsDateFilter,
    context?: SupabaseUserContext,
  ): Promise<TestPeriodReport> {
    const resolved = await resolveUserContext(context);
    const range = resolveReportsDateRange(filter);

    if (!resolved) {
      return {
        range,
        summary: emptySummary(),
        tests: [],
      };
    }

    const [testsRes, studentsRes] = await Promise.all([
      resolved.client
        .from("tests")
        .select("id, title, subject, grade, class_name, due_date, status, teacher_id")
        .eq("teacher_id", resolved.userId)
        .order("due_date", { ascending: true, nullsFirst: false }),
      resolved.client
        .from("students")
        .select("id, full_name, student_code, active, teacher_id")
        .eq("teacher_id", resolved.userId)
        .eq("active", true),
    ]);

    if (testsRes.error) throw testsRes.error;
    if (studentsRes.error) throw studentsRes.error;

    const testsInPeriod = ((testsRes.data ?? []) as TestRowLite[]).filter((row) =>
      isTestDueInRange(row.due_date, range),
    );

    const testIds = testsInPeriod.map((row) => row.id);
    let submissions: SubmissionRowLite[] = [];

    if (testIds.length > 0) {
      const submissionsRes = await resolved.client
        .from("test_submissions")
        .select(
          "id, test_id, student_id, status, score, max_score, feedback, submitted_at, graded_at, teacher_id",
        )
        .eq("teacher_id", resolved.userId)
        .in("test_id", testIds);

      if (submissionsRes.error) throw submissionsRes.error;
      submissions = (submissionsRes.data ?? []) as SubmissionRowLite[];
    }

    const summary = computeTestReportSummary({
      tests: testsInPeriod,
      submissions,
      activeStudentCount: (studentsRes.data ?? []).length,
    });

    const tests: TestReportListItem[] = testsInPeriod.map((row) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      className: row.class_name,
      dueDate: row.due_date,
      status: toTestStatus(row.status),
    }));

    return { range, summary, tests };
  }

  static async getTestDetail(
    testId: string,
    context?: SupabaseUserContext,
  ): Promise<TestDetailReport | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const testRes = await resolved.client
      .from("tests")
      .select("id, title, subject, grade, class_name, due_date, status, teacher_id")
      .eq("id", testId)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (testRes.error) throw testRes.error;
    if (!testRes.data) return null;

    const [submissionsRes, studentsRes] = await Promise.all([
      resolved.client
        .from("test_submissions")
        .select(
          "id, test_id, student_id, status, score, max_score, feedback, submitted_at, graded_at, teacher_id",
        )
        .eq("teacher_id", resolved.userId)
        .eq("test_id", testId),
      resolved.client
        .from("students")
        .select("id, full_name, student_code, active, teacher_id")
        .eq("teacher_id", resolved.userId),
    ]);

    if (submissionsRes.error) throw submissionsRes.error;
    if (studentsRes.error) throw studentsRes.error;

    const studentsById = new Map(
      ((studentsRes.data ?? []) as StudentRowLite[]).map((row) => [row.id, row]),
    );

    return computeTestDetail({
      test: testRes.data as TestRowLite,
      submissions: (submissionsRes.data ?? []) as SubmissionRowLite[],
      studentsById,
    });
  }
}

function emptySummary(): TestReportSummary {
  return computeTestReportSummary({
    tests: [],
    submissions: [],
    activeStudentCount: 0,
  });
}
