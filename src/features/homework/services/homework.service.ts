import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type HomeworkRow = Database["public"]["Tables"]["homework"]["Row"];
type HomeworkInsert = Database["public"]["Tables"]["homework"]["Insert"];
type HomeworkUpdate = Database["public"]["Tables"]["homework"]["Update"];

export type HomeworkStatus = "draft" | "assigned" | "collected" | "corrected";

const HOMEWORK_STATUSES: readonly HomeworkStatus[] = [
  "draft",
  "assigned",
  "collected",
  "corrected",
];

export function toHomeworkStatus(value: string): HomeworkStatus {
  return (HOMEWORK_STATUSES as readonly string[]).includes(value)
    ? (value as HomeworkStatus)
    : "draft";
}

export interface Homework {
  id: string;
  teacherId: string;
  lessonSessionId: string | null;
  title: string;
  instructions: string;
  subject: string | null;
  grade: string | null;
  className: string | null;
  dueDate: string | null;
  status: HomeworkStatus;
  createdAt: string;
  updatedAt: string;
}

export type HomeworkCreateInput = {
  title: string;
  instructions?: string;
  subject?: string | null;
  grade?: string | null;
  className?: string | null;
  dueDate?: string | null;
  status?: HomeworkStatus;
  lessonSessionId?: string | null;
};

export type HomeworkUpdateInput = Partial<HomeworkCreateInput>;

export type HomeworkListFilter = {
  status?: HomeworkStatus;
  lessonSessionId?: string;
};

function toHomework(row: HomeworkRow): Homework {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    lessonSessionId: row.lesson_session_id,
    title: row.title,
    instructions: row.instructions,
    subject: row.subject,
    grade: row.grade,
    className: row.class_name,
    dueDate: row.due_date,
    status: toHomeworkStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(teacherId: string, input: HomeworkCreateInput): HomeworkInsert {
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
  };
}

function toUpdatePatch(patch: HomeworkUpdateInput): HomeworkUpdate {
  const row: HomeworkUpdate = {};
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
  return row;
}

/**
 * Teacher-owned homework CRUD.
 *
 * Ownership always comes from resolveUserContext — never from a client teacher_id.
 * Optional lesson_session_id must belong to the same teacher when provided.
 */
export class HomeworkService {
  static async list(
    filter: HomeworkListFilter = {},
    context?: SupabaseUserContext,
  ): Promise<Homework[]> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    let query = resolved.client
      .from("homework")
      .select("*")
      .eq("teacher_id", resolved.userId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filter.status) {
      query = query.eq("status", filter.status);
    }
    if (filter.lessonSessionId) {
      query = query.eq("lesson_session_id", filter.lessonSessionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(toHomework);
  }

  static async getById(id: string, context?: SupabaseUserContext): Promise<Homework | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("homework")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .maybeSingle();

    if (error) throw error;
    return data ? toHomework(data) : null;
  }

  static async create(
    input: HomeworkCreateInput,
    context?: SupabaseUserContext,
  ): Promise<Homework | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (!input.title?.trim()) {
      throw new Error("عنوان الواجب مطلوب.");
    }

    await assertOwnedLessonSession(resolved, input.lessonSessionId ?? null);

    const { data, error } = await resolved.client
      .from("homework")
      .insert(toInsertRow(resolved.userId, input))
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toHomework(data) : null;
  }

  static async update(
    id: string,
    patch: HomeworkUpdateInput,
    context?: SupabaseUserContext,
  ): Promise<Homework | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("عنوان الواجب مطلوب.");
    }

    if (patch.lessonSessionId !== undefined) {
      await assertOwnedLessonSession(resolved, patch.lessonSessionId);
    }

    const row = toUpdatePatch(patch);
    if (Object.keys(row).length === 0) {
      return this.getById(id, resolved);
    }

    const { data, error } = await resolved.client
      .from("homework")
      .update(row)
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toHomework(data) : null;
  }

  static async delete(id: string, context?: SupabaseUserContext): Promise<boolean> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return false;

    const { data, error } = await resolved.client
      .from("homework")
      .delete()
      .eq("id", id)
      .eq("teacher_id", resolved.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }
}

async function assertOwnedLessonSession(
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
