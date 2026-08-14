import type { SupabaseUserContext } from "@/platform/database/supabase/context";

export type MockRow = Record<string, unknown>;

export type TestsMockDb = {
  tests: MockRow[];
  test_questions: MockRow[];
  test_options: MockRow[];
  test_submissions: MockRow[];
  test_answers: MockRow[];
  lesson_sessions: MockRow[];
  students: MockRow[];
  ai_generations: MockRow[];
};

export const TEACHER_A = "11111111-1111-4111-8111-111111111111";
export const TEACHER_B = "22222222-2222-4222-8222-222222222222";
export const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const STUDENT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const STUDENT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const GEN_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function matchesEq(row: MockRow, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function matchesIn(row: MockRow, column: string, values: unknown[]): boolean {
  return values.includes(row[column]);
}

export function createEmptyTestsDb(): TestsMockDb {
  return {
    tests: [],
    test_questions: [],
    test_options: [],
    test_submissions: [],
    test_answers: [],
    lesson_sessions: [],
    students: [],
    ai_generations: [],
  };
}

export function createTestsMockClient(db: TestsMockDb & { __idCounter?: number }) {
  if (db.__idCounter == null) db.__idCounter = 1;

  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inFilters: Record<string, unknown[]>;
        op: "select" | "insert" | "update" | "delete" | null;
        insertRows: MockRow[];
        patch: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        inFilters: {},
        op: null,
        insertRows: [],
        patch: {},
        orders: [],
      };

      const tableKey = table as keyof TestsMockDb;

      const runSelect = (): MockRow[] => {
        let rows = [...(db[tableKey] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }
        for (const [column, values] of Object.entries(state.inFilters)) {
          rows = rows.filter((row) => matchesIn(row, column, values));
        }
        for (const order of state.orders) {
          rows.sort((a, b) => {
            const av = a[order.column];
            const bv = b[order.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return order.ascending ? -1 : 1;
            return order.ascending ? 1 : -1;
          });
        }
        return rows;
      };

      const uniqueError = (message: string) => ({
        data: null,
        error: { code: "23505", message },
      });

      const chain = {
        select(_columns?: string) {
          if (state.op !== "insert" && state.op !== "update" && state.op !== "delete") {
            state.op = "select";
          }
          return chain;
        },
        insert(rows: MockRow | MockRow[]) {
          state.op = "insert";
          state.insertRows = Array.isArray(rows) ? rows : [rows];
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          state.patch = patch;
          return chain;
        },
        delete() {
          state.op = "delete";
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          state.inFilters[column] = values;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          return execute("single");
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return execute("many").then(resolve, reject);
        },
      };

      async function execute(mode: "single" | "many"): Promise<{ data: unknown; error: unknown }> {
        if (state.op === "insert") {
          if (table === "test_submissions") {
            for (const row of state.insertRows) {
              if (
                db.test_submissions.some(
                  (existing) =>
                    existing.test_id === row.test_id && existing.student_id === row.student_id,
                )
              ) {
                return uniqueError("duplicate key value violates unique constraint");
              }
            }
          }
          if (table === "test_questions") {
            for (const row of state.insertRows) {
              if (
                db.test_questions.some(
                  (existing) =>
                    existing.test_id === row.test_id && existing.position === row.position,
                )
              ) {
                return uniqueError("duplicate key value violates unique constraint");
              }
            }
          }
          if (table === "test_answers") {
            for (const row of state.insertRows) {
              if (
                db.test_answers.some(
                  (existing) =>
                    existing.submission_id === row.submission_id &&
                    existing.question_id === row.question_id,
                )
              ) {
                return uniqueError("duplicate key value violates unique constraint");
              }
              const submission = db.test_submissions.find((s) => s.id === row.submission_id);
              const question = db.test_questions.find((q) => q.id === row.question_id);
              if (!submission || !question || submission.test_id !== question.test_id) {
                return {
                  data: null,
                  error: {
                    message: "test answer question does not belong to the submission test",
                  },
                };
              }
              if (row.selected_option_id) {
                const option = db.test_options.find((o) => o.id === row.selected_option_id);
                if (!option || option.question_id !== row.question_id) {
                  return {
                    data: null,
                    error: {
                      message: "test answer selected option does not belong to the question",
                    },
                  };
                }
              }
            }
          }

          const target = db[tableKey] ?? [];
          const insertedRows = state.insertRows.map((row) => {
            const inserted = {
              id: `${table}-${db.__idCounter!++}`,
              created_at: "2026-08-15T00:00:00Z",
              updated_at: "2026-08-15T00:00:00Z",
              ...defaultsFor(table),
              ...row,
            };
            target.push(inserted);
            return inserted;
          });

          if (mode === "single") {
            return { data: insertedRows[0] ? { ...insertedRows[0] } : null, error: null };
          }
          return { data: insertedRows, error: null };
        }

        if (state.op === "update") {
          const target = (db[tableKey] ?? []).filter((row) => matchesEq(row, state.filters));
          const current = target[0];
          if (!current) return { data: null, error: null };
          Object.assign(current, state.patch, { updated_at: "2026-08-15T12:00:00Z" });
          return { data: { ...current }, error: null };
        }

        if (state.op === "delete") {
          const rows = db[tableKey] ?? [];
          const removing = rows.filter((row) => matchesEq(row, state.filters));
          const remaining = rows.filter((row) => !matchesEq(row, state.filters));
          db[tableKey] = remaining;

          if (table === "tests") {
            for (const removed of removing) {
              const qids = db.test_questions
                .filter((q) => q.test_id === removed.id)
                .map((q) => q.id as string);
              db.test_questions = db.test_questions.filter((q) => q.test_id !== removed.id);
              db.test_options = db.test_options.filter(
                (o) => !qids.includes(o.question_id as string),
              );
              const submissionIds = db.test_submissions
                .filter((s) => s.test_id === removed.id)
                .map((s) => s.id as string);
              db.test_submissions = db.test_submissions.filter((s) => s.test_id !== removed.id);
              db.test_answers = db.test_answers.filter(
                (a) => !submissionIds.includes(a.submission_id as string),
              );
            }
          }
          if (table === "test_questions") {
            const qids = removing.map((q) => q.id as string);
            db.test_options = db.test_options.filter(
              (o) => !qids.includes(o.question_id as string),
            );
          }
          if (table === "test_submissions") {
            const submissionIds = removing.map((s) => s.id as string);
            db.test_answers = db.test_answers.filter(
              (a) => !submissionIds.includes(a.submission_id as string),
            );
          }

          if (mode === "single") {
            const removed = removing[0];
            return { data: removed ? { id: removed.id } : null, error: null };
          }
          return {
            data: removing.map((row) => ({ id: row.id })),
            error: null,
          };
        }

        const rows = runSelect();
        if (mode === "single") {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      return chain;
    },
  };

  return client as never;
}

function defaultsFor(table: string): MockRow {
  switch (table) {
    case "tests":
      return {
        instructions: "",
        subject: null,
        grade: null,
        class_name: null,
        due_date: null,
        status: "draft",
        lesson_session_id: null,
        source_ai_generation_id: null,
      };
    case "test_questions":
      return { points: 1 };
    case "test_options":
      return { is_correct: false };
    case "test_submissions":
      return {
        status: "pending",
        score: null,
        max_score: null,
        feedback: null,
        submitted_at: null,
        graded_at: null,
      };
    case "test_answers":
      return {
        selected_option_id: null,
        boolean_answer: null,
        is_correct: null,
        points_awarded: null,
      };
    default:
      return {};
  }
}

export function authFor(db: TestsMockDb, userId = TEACHER_A): SupabaseUserContext {
  return { client: createTestsMockClient(db), userId };
}
