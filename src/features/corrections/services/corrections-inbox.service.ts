import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import { HomeworkSubmissionService } from "@/features/homework/services/homework-submission.service";
import { TestSubmissionService } from "@/features/tests/services/test-submission.service";

import {
  mergeCorrectionInboxItems,
  type CorrectionInboxItem,
  type CorrectionInboxRawHomework,
  type CorrectionInboxRawTest,
} from "./corrections-inbox.logic";

/**
 * TASK 23 — Teacher-owned corrections inbox.
 * Aggregates submitted homework + test submissions without N+1 per parent.
 */
export class CorrectionsInboxService {
  static async listNeedsAction(
    context?: SupabaseUserContext,
  ): Promise<CorrectionInboxItem[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const [homeworkSubs, testSubs] = await Promise.all([
      HomeworkSubmissionService.listSubmittedForTeacher(resolved),
      TestSubmissionService.listSubmittedForTeacher(resolved),
    ]);

    const homeworkIds = uniqueIds(homeworkSubs.map((row) => row.homeworkId));
    const testIds = uniqueIds(testSubs.map((row) => row.testId));
    const studentIds = uniqueIds([
      ...homeworkSubs.map((row) => row.studentId),
      ...testSubs.map((row) => row.studentId),
    ]);

    const [homeworkTitles, testTitles, studentNames] = await Promise.all([
      loadTitleMap(resolved, "homework", homeworkIds),
      loadTitleMap(resolved, "tests", testIds),
      loadStudentNameMap(resolved, studentIds),
    ]);

    const homeworkRaw: CorrectionInboxRawHomework[] = homeworkSubs.map((row) => ({
      submissionId: row.id,
      homeworkId: row.homeworkId,
      studentId: row.studentId,
      studentName: studentNames.get(row.studentId) ?? null,
      title: homeworkTitles.get(row.homeworkId) ?? null,
      status: row.status,
      submittedAt: row.submittedAt,
      score: row.score,
      feedback: row.feedback,
    }));

    const testRaw: CorrectionInboxRawTest[] = testSubs.map((row) => ({
      submissionId: row.id,
      testId: row.testId,
      studentId: row.studentId,
      studentName: studentNames.get(row.studentId) ?? null,
      title: testTitles.get(row.testId) ?? null,
      status: row.status,
      submittedAt: row.submittedAt,
      score: row.score,
      maxScore: row.maxScore,
      feedback: row.feedback,
    }));

    return mergeCorrectionInboxItems(homeworkRaw, testRaw);
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
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
    const id = String((row as { id: string }).id);
    const title = String((row as { title?: string | null }).title ?? "").trim();
    if (id && title) map.set(id, title);
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
    const id = String((row as { id: string }).id);
    const name = String((row as { full_name?: string | null }).full_name ?? "").trim();
    if (id && name) map.set(id, name);
  }
  return map;
}
