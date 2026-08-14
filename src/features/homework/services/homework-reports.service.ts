import {
  resolveReportsDateRange,
  type ReportsDateFilter,
} from "@/features/reports/services/reports.service";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

import {
  toHomeworkSubmissionStatus,
  type HomeworkSubmissionStatus,
} from "./homework-submission.service";
import { toHomeworkStatus, type HomeworkStatus } from "./homework.service";

/**
 * Period filtering uses homework.due_date (inclusive YYYY-MM-DD).
 * Homework with null due_date is excluded from period summaries — the model has
 * no alternate reliable period field without inventing created_at as due date.
 *
 * expectedSubmissions = count of submission rows for homework in the period.
 * There is no per-homework roster assignment table, so we do not invent
 * activeStudents × homeworkCount as "expected".
 */

export type HomeworkReportSummary = {
  totalHomework: number;
  draftHomework: number;
  assignedHomework: number;
  collectedHomework: number;
  correctedHomework: number;
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
   * 0 when there are no scored graded rows (avoids inventing null metrics in UI).
   */
  averageScore: number;
};

export type HomeworkReportListItem = {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: HomeworkStatus;
};

export type HomeworkPeriodReport = {
  range: { from: string; to: string };
  summary: HomeworkReportSummary;
  homework: HomeworkReportListItem[];
};

export type StudentPerformanceRow = {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  status: HomeworkSubmissionStatus;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
};

export type HomeworkDetailReport = {
  homeworkId: string;
  title: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: HomeworkStatus;
  /** Students with a submission row for this homework. */
  numberOfStudents: number;
  submittedCount: number;
  gradedCount: number;
  averageScore: number;
  students: StudentPerformanceRow[];
};

type HomeworkRowLite = {
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
  homework_id: string;
  student_id: string;
  status: string;
  score: number | null;
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

export function isHomeworkDueInRange(
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
  const values = scores.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function computeHomeworkReportSummary(input: {
  homework: Array<{ status: string }>;
  submissions: Array<{ status: string; score: number | null }>;
  activeStudentCount: number;
}): HomeworkReportSummary {
  const totalHomework = input.homework.length;
  let draftHomework = 0;
  let assignedHomework = 0;
  let collectedHomework = 0;
  let correctedHomework = 0;

  for (const row of input.homework) {
    const status = toHomeworkStatus(row.status);
    if (status === "draft") draftHomework += 1;
    else if (status === "assigned") assignedHomework += 1;
    else if (status === "collected") collectedHomework += 1;
    else if (status === "corrected") correctedHomework += 1;
  }

  let pendingSubmissions = 0;
  let submittedSubmissions = 0;
  let gradedSubmissions = 0;
  const gradedScores: number[] = [];

  for (const row of input.submissions) {
    const status = toHomeworkSubmissionStatus(row.status);
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
    totalHomework,
    draftHomework,
    assignedHomework,
    collectedHomework,
    correctedHomework,
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

export function computeHomeworkDetail(input: {
  homework: HomeworkRowLite;
  submissions: SubmissionRowLite[];
  studentsById: Map<string, StudentRowLite>;
}): HomeworkDetailReport {
  let submittedCount = 0;
  let gradedCount = 0;
  const gradedScores: number[] = [];

  const students: StudentPerformanceRow[] = input.submissions.map((row) => {
    const status = toHomeworkSubmissionStatus(row.status);
    if (status === "submitted") submittedCount += 1;
    if (status === "graded") {
      gradedCount += 1;
      if (row.score != null && Number.isFinite(row.score)) gradedScores.push(row.score);
    }
    const student = input.studentsById.get(row.student_id);
    return {
      studentId: row.student_id,
      studentName: student?.full_name ?? "طالب غير معروف",
      studentCode: student?.student_code ?? null,
      status,
      score: row.score,
      feedback: row.feedback,
      submittedAt: row.submitted_at,
      gradedAt: row.graded_at,
    };
  });

  students.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"));

  return {
    homeworkId: input.homework.id,
    title: input.homework.title,
    subject: input.homework.subject,
    grade: input.homework.grade,
    className: input.homework.class_name,
    dueDate: input.homework.due_date,
    status: toHomeworkStatus(input.homework.status),
    numberOfStudents: students.length,
    submittedCount,
    gradedCount,
    averageScore: averageNumericScores(gradedScores),
    students,
  };
}

/**
 * Read-only homework reports. Teacher scope via resolveUserContext only.
 */
export class HomeworkReportsService {
  static async getPeriodReport(
    filter: ReportsDateFilter,
    context?: SupabaseUserContext,
  ): Promise<HomeworkPeriodReport> {
    const resolved = await resolveUserContext(context);
    const range = resolveReportsDateRange(filter);

    if (!resolved) {
      return {
        range,
        summary: emptySummary(),
        homework: [],
      };
    }

    const [homeworkRes, studentsRes] = await Promise.all([
      resolved.client
        .from("homework")
        .select("id, title, subject, grade, class_name, due_date, status, teacher_id")
        .eq("teacher_id", resolved.userId)
        .order("due_date", { ascending: true, nullsFirst: false }),
      resolved.client
        .from("students")
        .select("id, full_name, student_code, active, teacher_id")
        .eq("teacher_id", resolved.userId)
        .eq("active", true),
    ]);

    if (homeworkRes.error) throw homeworkRes.error;
    if (studentsRes.error) throw studentsRes.error;

    const homeworkInPeriod = ((homeworkRes.data ?? []) as HomeworkRowLite[]).filter((row) =>
      isHomeworkDueInRange(row.due_date, range),
    );

    const homeworkIds = homeworkInPeriod.map((row) => row.id);
    let submissions: SubmissionRowLite[] = [];

    if (homeworkIds.length > 0) {
      const submissionsRes = await resolved.client
        .from("homework_submissions")
        .select(
          "id, homework_id, student_id, status, score, feedback, submitted_at, graded_at, teacher_id",
        )
        .eq("teacher_id", resolved.userId)
        .in("homework_id", homeworkIds);

      if (submissionsRes.error) throw submissionsRes.error;
      submissions = (submissionsRes.data ?? []) as SubmissionRowLite[];
    }

    const summary = computeHomeworkReportSummary({
      homework: homeworkInPeriod,
      submissions,
      activeStudentCount: (studentsRes.data ?? []).length,
    });

    const homework: HomeworkReportListItem[] = homeworkInPeriod.map((row) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      className: row.class_name,
      dueDate: row.due_date,
      status: toHomeworkStatus(row.status),
    }));

    return { range, summary, homework };
  }

  static async getHomeworkDetail(
    homeworkId: string,
    context?: SupabaseUserContext,
  ): Promise<HomeworkDetailReport | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const homeworkRes = await resolved.client
      .from("homework")
      .select("id, title, subject, grade, class_name, due_date, status, teacher_id")
      .eq("id", homeworkId)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (homeworkRes.error) throw homeworkRes.error;
    if (!homeworkRes.data) return null;

    const [submissionsRes, studentsRes] = await Promise.all([
      resolved.client
        .from("homework_submissions")
        .select(
          "id, homework_id, student_id, status, score, feedback, submitted_at, graded_at, teacher_id",
        )
        .eq("teacher_id", resolved.userId)
        .eq("homework_id", homeworkId),
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

    return computeHomeworkDetail({
      homework: homeworkRes.data as HomeworkRowLite,
      submissions: (submissionsRes.data ?? []) as SubmissionRowLite[],
      studentsById,
    });
  }
}

function emptySummary(): HomeworkReportSummary {
  return computeHomeworkReportSummary({
    homework: [],
    submissions: [],
    activeStudentCount: 0,
  });
}
