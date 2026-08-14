import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type TestRow = Database["public"]["Tables"]["tests"]["Row"];
type TestInsert = Database["public"]["Tables"]["tests"]["Insert"];
type TestUpdate = Database["public"]["Tables"]["tests"]["Update"];

export type TestStatus = "draft" | "published" | "closed";

const TEST_STATUSES: readonly TestStatus[] = ["draft", "published", "closed"];

export function toTestStatus(value: string): TestStatus {
  return (TEST_STATUSES as readonly string[]).includes(value)
    ? (value as TestStatus)
    : "draft";
}

export function assertTestStatus(value: string): asserts value is TestStatus {
  if (!(TEST_STATUSES as readonly string[]).includes(value)) {
    throw new Error("حالة الاختبار غير صالحة. القيم المسموحة: draft و published و closed.");
  }
}

export interface TeacherTest {
  id: string;
  teacherId: string;
  lessonSessionId: string | null;
  sourceAiGenerationId: string | null;
  title: string;
  instructions: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: TestStatus;
  createdAt: string;
  updatedAt: string;
}

export type TestCreateInput = {
  title: string;
  instructions?: string;
  subject?: string | null;
  grade?: string | null;
  className?: string | null;
  dueDate?: string | null;
  status?: TestStatus;
  lessonSessionId?: string | null;
  sourceAiGenerationId?: string | null;
};

export type TestUpdateInput = Partial<TestCreateInput>;

export type TestListFilter = {
  status?: TestStatus;
  lessonSessionId?: string;
};

function toTest(row: TestRow): TeacherTest {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    lessonSessionId: row.lesson_session_id,
    sourceAiGenerationId: row.source_ai_generation_id,
    title: row.title,
    instructions: row.instructions,
    subject: row.subject,
    grade: row.grade,
    className: row.class_name,
    dueDate: row.due_date,
    status: toTestStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: TestCreateInput): TestInsert {
  return {
    teacher_id: teacherId,
    title: input.title.trim(),
    instructions: (input.instructions ?? "").trim(),
    subject: input.subject?.trim() ? input.subject.trim() : null,
    grade: input.grade?.trim() ? input.grade.trim() : null,
    class_name: input.className?.trim() ? input.className.trim() : null,
    due_date: input.dueDate ?? null,
    status: input.status ?? "draft",
    lesson_session_id: input.lessonSessionId ?? null,
    source_ai_generation_id: input.sourceAiGenerationId ?? null,
  };
}

function toUpdatePatch(patch: TestUpdateInput): TestUpdate {
  const row: TestUpdate = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.instructions !== undefined) row.instructions = patch.instructions.trim();
  if (patch.subject !== undefined) {
    row.subject = patch.subject?.trim() ? patch.subject.trim() : null;
  }
  if (patch.grade !== undefined) {
    row.grade = patch.grade?.trim() ? patch.grade.trim() : null;
  }
  if (patch.className !== undefined) {
    row.class_name = patch.className?.trim() ? patch.className.trim() : null;
  }
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.lessonSessionId !== undefined) {
    row.lesson_session_id = patch.lessonSessionId ?? null;
  }
  if (patch.sourceAiGenerationId !== undefined) {
    row.source_ai_generation_id = patch.sourceAiGenerationId ?? null;
  }
  return row;
}

/**
 * Teacher-owned test CRUD + publish/close.
 * Ownership always from resolveUserContext — never client teacher_id.
 */
export class TestService {
  static async list(
    filter: TestListFilter = {},
    context?: SupabaseUserContext,
  ): Promise<TeacherTest[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    let query = resolved.client
      .from("tests")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.lessonSessionId) query = query.eq("lesson_session_id", filter.lessonSessionId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toTest);
  }

  static async getById(id: string, context?: SupabaseUserContext): Promise<TeacherTest | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("tests")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toTest(data) : null;
  }

  static async create(
    input: TestCreateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherTest | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!input.title?.trim()) {
      throw new Error("عنوان الاختبار مطلوب.");
    }
    if (input.status !== undefined) assertTestStatus(input.status);

    await assertOwnedLessonSession(resolved, input.lessonSessionId ?? null);
    await assertOwnedAiGeneration(resolved, input.sourceAiGenerationId ?? null);

    const { data, error } = await resolved.client
      .from("tests")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toTest(data) : null;
  }

  static async update(
    id: string,
    patch: TestUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<TeacherTest | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("عنوان الاختبار مطلوب.");
    }
    if (patch.status !== undefined) assertTestStatus(patch.status);

    if (patch.lessonSessionId !== undefined) {
      await assertOwnedLessonSession(resolved, patch.lessonSessionId);
    }
    if (patch.sourceAiGenerationId !== undefined) {
      await assertOwnedAiGeneration(resolved, patch.sourceAiGenerationId);
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("tests")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toTest(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("tests")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  static async publish(id: string, context?: SupabaseUserContext): Promise<TeacherTest | null> {
    return this.update(id, { status: "published" }, context);
  }

  static async close(id: string, context?: SupabaseUserContext): Promise<TeacherTest | null> {
    return this.update(id, { status: "closed" }, context);
  }
}

export async function assertOwnedLessonSession(
  context: SupabaseUserContext,
  lessonSessionId: string | null,
): Promise<void> {
  if (!lessonSessionId) return;

  const { data, error } = await context.client
    .from("lesson_sessions")
    .select("id")
    .eq("id", lessonSessionId)
    .eq("teacher_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("الحصة المرتبطة غير موجودة أو لا تملك صلاحية الوصول إليها.");
  }
}

export async function assertOwnedAiGeneration(
  context: SupabaseUserContext,
  generationId: string | null,
): Promise<void> {
  if (!generationId) return;

  const { data, error } = await context.client
    .from("ai_generations")
    .select("id")
    .eq("id", generationId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("توليد الذكاء الاصطناعي غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
}

export async function assertOwnedTest(
  context: SupabaseUserContext,
  testId: string,
): Promise<TeacherTest> {
  const test = await TestService.getById(testId, context);
  if (!test) {
    throw new Error("الاختبار غير موجود أو لا تملك صلاحية الوصول إليه.");
  }
  return test;
}
