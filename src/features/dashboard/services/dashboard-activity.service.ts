import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import { CorrectionsInboxService } from "@/features/corrections/services/corrections-inbox.service";

import {
  buildActivityFeed,
  buildPendingTasks,
  DASHBOARD_ACTIVITY_LIMIT,
  DASHBOARD_PENDING_LIMIT,
  type DashboardActivityItem,
  type DashboardPendingTask,
  type GradedSubmissionForDashboard,
} from "./dashboard-activity.logic";

export type DashboardActivitySnapshot = {
  pending: DashboardPendingTask[];
  activity: DashboardActivityItem[];
};

/**
 * TASK 25.6 — Teacher-owned dashboard pending tasks + recent activity.
 * Read-only aggregation from existing submissions. No notification writes.
 */
export class DashboardActivityService {
  static async getSnapshot(
    context?: SupabaseUserContext,
  ): Promise<DashboardActivitySnapshot> {
    const resolved = await resolveUserContext(context);
    if (!resolved) {
      return { pending: [], activity: [] };
    }

    const [inbox, gradedHomework, gradedTests] = await Promise.all([
      CorrectionsInboxService.listNeedsAction(resolved),
      listRecentGradedHomework(resolved),
      listRecentGradedTests(resolved),
    ]);

    const graded: GradedSubmissionForDashboard[] = [
      ...gradedHomework,
      ...gradedTests,
    ];

    const gradedNeedingFeedback = graded.filter(
      (row) => row.status === "graded" && !row.feedback?.trim(),
    );

    return {
      pending: buildPendingTasks({
        inbox,
        gradedNeedingFeedback,
        limit: DASHBOARD_PENDING_LIMIT,
      }),
      activity: buildActivityFeed({
        inbox,
        graded,
        limit: DASHBOARD_ACTIVITY_LIMIT,
      }),
    };
  }
}

async function listRecentGradedHomework(
  context: SupabaseUserContext,
): Promise<GradedSubmissionForDashboard[]> {
  const { data, error } = await context.client
    .from("homework_submissions")
    .select("id, homework_id, student_id, status, feedback, submitted_at, graded_at")
    .eq("teacher_id", context.userId)
    .eq("status", "graded")
    .order("graded_at", { ascending: false, nullsFirst: false })
    .limit(DASHBOARD_ACTIVITY_LIMIT);

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const homeworkIds = uniqueIds(rows.map((row) => row.homework_id));
  const studentIds = uniqueIds(rows.map((row) => row.student_id));
  const [titles, names] = await Promise.all([
    loadTitleMap(context, "homework", homeworkIds),
    loadStudentNameMap(context, studentIds),
  ]);

  return rows.map((row) => ({
    submissionId: row.id,
    parentId: row.homework_id,
    parentTitle: titles.get(row.homework_id) ?? null,
    studentName: names.get(row.student_id) ?? null,
    status: row.status,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    source: "homework" as const,
  }));
}

async function listRecentGradedTests(
  context: SupabaseUserContext,
): Promise<GradedSubmissionForDashboard[]> {
  const { data, error } = await context.client
    .from("test_submissions")
    .select("id, test_id, student_id, status, feedback, submitted_at, graded_at")
    .eq("teacher_id", context.userId)
    .eq("status", "graded")
    .order("graded_at", { ascending: false, nullsFirst: false })
    .limit(DASHBOARD_ACTIVITY_LIMIT);

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const testIds = uniqueIds(rows.map((row) => row.test_id));
  const studentIds = uniqueIds(rows.map((row) => row.student_id));
  const [titles, names] = await Promise.all([
    loadTitleMap(context, "tests", testIds),
    loadStudentNameMap(context, studentIds),
  ]);

  return rows.map((row) => ({
    submissionId: row.id,
    parentId: row.test_id,
    parentTitle: titles.get(row.test_id) ?? null,
    studentName: names.get(row.student_id) ?? null,
    status: row.status,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    source: "test" as const,
  }));
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function loadTitleMap(
  context: SupabaseUserContext,
  table: "homework" | "tests",
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await context.client
    .from(table)
    .select("id, title")
    .eq("teacher_id", context.userId)
    .in("id", ids);

  if (error) throw error;
  for (const row of data ?? []) {
    const title = String(row.title ?? "").trim();
    if (title) map.set(row.id, title);
  }
  return map;
}

async function loadStudentNameMap(
  context: SupabaseUserContext,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await context.client
    .from("students")
    .select("id, full_name")
    .eq("teacher_id", context.userId)
    .in("id", ids);

  if (error) throw error;
  for (const row of data ?? []) {
    const name = String(row.full_name ?? "").trim();
    if (name) map.set(row.id, name);
  }
  return map;
}
