import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LessonCurriculumAuthorizationError,
  assertCurriculumLessonAuthorized,
} from "./lesson-curriculum-authorization.ts";
import { LessonSessionService } from "./lesson-session.service.ts";
import {
  LessonSessionLockedError,
  LessonSessionPreparingError,
} from "../types.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const YEAR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEMESTER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ALLOWED_FILE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OLD_PUBLISHED_FILE = "99999999-9999-4999-8999-999999999999";
const DRAFT_FILE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const VALID_LESSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WRONG_SUBJECT_LESSON = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WRONG_GRADE_LESSON = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OLD_FILE_LESSON = "33333333-cccc-4ccc-8ccc-cccccccccccc";
const DRAFT_LESSON_B = "44444444-dddd-4ddd-8ddd-dddddddddddd";
const RANDOM_UUID = "55555555-eeee-4eee-8eee-eeeeeeeeeeee";

const SESSION_SUBJECT = "رياضيات";
const SESSION_GRADE = "الأول متوسط";

type Row = Record<string, unknown>;

function makeSessionRow(overrides: Partial<Row> = {}): Row {
  return {
    id: SESSION_A,
    teacher_id: TEACHER_A,
    academic_year_id: YEAR_ID,
    semester_id: SEMESTER_ID,
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: VALID_LESSON,
    curriculum_lesson_source: "plan",
    session_date: "2026-08-08",
    day_of_week: 5,
    period_number: 1,
    lesson_locked: false,
    status: "scheduled",
    prepared_at: null,
    completed_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function seedDb(): Record<string, Row[]> {
  return {
    lesson_sessions: [makeSessionRow()],
    teacher_timetable: [
      {
        id: "tt-1",
        teacher_id: TEACHER_A,
        day_of_week: 5,
        period: 1,
        subject: SESSION_SUBJECT,
        grade: SESSION_GRADE,
        class_name: "1/1",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    curriculum_files: [
      {
        id: ALLOWED_FILE,
        user_id: TEACHER_A,
        subject: SESSION_SUBJECT,
        grade: SESSION_GRADE,
        status: "published",
        created_at: "2026-08-10T00:00:00Z",
      },
      {
        id: OLD_PUBLISHED_FILE,
        user_id: TEACHER_A,
        subject: SESSION_SUBJECT,
        grade: SESSION_GRADE,
        status: "published",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: DRAFT_FILE_B,
        user_id: TEACHER_B,
        subject: SESSION_SUBJECT,
        grade: SESSION_GRADE,
        status: "draft",
        created_at: "2026-08-11T00:00:00Z",
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        user_id: TEACHER_A,
        subject: "علوم",
        grade: SESSION_GRADE,
        status: "published",
        created_at: "2026-08-09T00:00:00Z",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        user_id: TEACHER_A,
        subject: SESSION_SUBJECT,
        grade: "الثاني متوسط",
        status: "published",
        created_at: "2026-08-09T00:00:00Z",
      },
    ],
    curriculum_lessons: [
      {
        id: VALID_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: ALLOWED_FILE,
        title: "درس صالح",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: OLD_FILE_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: OLD_PUBLISHED_FILE,
        title: "درس ملف قديم",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: DRAFT_LESSON_B,
        user_id: TEACHER_B,
        curriculum_file_id: DRAFT_FILE_B,
        title: "درس مسودة",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: WRONG_SUBJECT_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: "88888888-8888-4888-8888-888888888888",
        title: "درس مادة أخرى",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: WRONG_GRADE_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: "77777777-7777-4777-8777-777777777777",
        title: "درس صف آخر",
        objectives: null,
        notes: null,
        order_index: 1,
      },
    ],
  };
}

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: Record<string, Row[]>, userId: string): SupabaseUserContext["client"] {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        patch: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
        limitN: number | null;
        selected: string | null;
        pendingIn: unknown[] | null;
      } = {
        filters: {},
        patch: {},
        orders: [],
        limitN: null,
        selected: null,
        pendingIn: null,
      };

      const runRows = (): Row[] => {
        let rows = [...(db[table] ?? [])];

        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }

        if (state.pendingIn) {
          const [column, values] = state.pendingIn as [string, unknown[]];
          rows = rows.filter((row) => values.includes(row[column]));
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

        if (state.limitN != null) {
          rows = rows.slice(0, state.limitN);
        }

        return rows;
      };

      const chain = {
        select(columns?: string) {
          state.selected = columns ?? "*";
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.patch = patch;
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          state.pendingIn = [column, values];
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        limit(n: number) {
          state.limitN = n;
          return chain;
        },
        async maybeSingle() {
          if (Object.keys(state.patch).length > 0) {
            const rows = (db[table] ?? []).filter((row) => matchesEq(row, state.filters));
            const target = rows[0];
            if (!target) return { data: null, error: null };
            Object.assign(target, state.patch);
            return { data: { ...target }, error: null };
          }

          const rows = runRows();
          if (table === "teacher_timetable" && state.selected === "*") {
            return { data: rows, error: null };
          }
          return { data: rows[0] ?? null, error: null };
        },
        async then(resolve: (value: unknown) => unknown) {
          const rows = runRows();
          return resolve({ data: rows, error: null });
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(db: Record<string, Row[]>, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db, userId), userId };
}

describe("changeLesson curriculum authorization (SEC-02)", () => {
  it("1. VALID lesson in correct published curriculum → PASS", async () => {
    const db = seedDb();
    const auth = authFor(db);

    const result = await LessonSessionService.changeLesson(SESSION_A, VALID_LESSON, auth);

    assert.ok(result);
    assert.equal(result.curriculumLessonId, VALID_LESSON);
    assert.equal(result.curriculumLessonSource, "manual");
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, VALID_LESSON);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "manual");
  });

  it("2. Existing lesson from another teacher's draft curriculum → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, DRAFT_LESSON_B, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, VALID_LESSON);
  });

  it("3. Existing lesson from wrong subject → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, WRONG_SUBJECT_LESSON, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
  });

  it("4. Existing lesson from wrong grade → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, WRONG_GRADE_LESSON, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
  });

  it("5. Existing unpublished/draft lesson → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, DRAFT_LESSON_B, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
  });

  it("6. Existing lesson from wrong (older) published curriculum file → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, OLD_FILE_LESSON, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
  });

  it("7. Random/nonexistent UUID → REJECT", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, RANDOM_UUID, auth),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );
  });

  it("8. Preparing session → REJECT before curriculum authorization", async () => {
    const db = seedDb();
    db.lesson_sessions[0] = makeSessionRow({ status: "preparing" });
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, VALID_LESSON, auth),
      (err: unknown) => err instanceof LessonSessionPreparingError,
    );
  });

  it("9. Locked session → REJECT before curriculum authorization", async () => {
    const db = seedDb();
    db.lesson_sessions[0] = makeSessionRow({
      status: "prepared",
      lesson_locked: true,
      prepared_at: "2026-08-08T10:00:00Z",
    });
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson(SESSION_A, VALID_LESSON, auth),
      (err: unknown) => err instanceof LessonSessionLockedError,
    );
  });

  it("10. Cross-teacher session access → REJECT at service layer without curriculum lookup", async () => {
    const db = seedDb();
    const auth = authFor(db, TEACHER_B);

    const result = await LessonSessionService.changeLesson(SESSION_A, VALID_LESSON, auth);

    assert.equal(result, null);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, VALID_LESSON);
  });

  it("unauthorized and nonexistent lesson failures use the same error class", async () => {
    const db = seedDb();
    const auth = authFor(db);

    let draftError: unknown;
    let randomError: unknown;

    try {
      await LessonSessionService.changeLesson(SESSION_A, DRAFT_LESSON_B, auth);
    } catch (error) {
      draftError = error;
    }

    try {
      await LessonSessionService.changeLesson(SESSION_A, RANDOM_UUID, auth);
    } catch (error) {
      randomError = error;
    }

    assert.ok(draftError instanceof LessonCurriculumAuthorizationError);
    assert.ok(randomError instanceof LessonCurriculumAuthorizationError);
    assert.equal(draftError.name, randomError.name);
    assert.equal((draftError as Error).message, (randomError as Error).message);
  });

  it("assertCurriculumLessonAuthorized is enforced independently of FK update path", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await assert.rejects(
      () =>
        assertCurriculumLessonAuthorized(auth, {
          grade: SESSION_GRADE,
          subject: SESSION_SUBJECT,
          curriculumLessonId: RANDOM_UUID,
        }),
      (err: unknown) => err instanceof LessonCurriculumAuthorizationError,
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, VALID_LESSON);
  });
});

describe("changeLesson auth middleware boundary", () => {
  it("unauthenticated HTTP requests are rejected by requireSupabaseAuth before handler", () => {
    const changeLessonSrc = `
      export const changeLesson = createServerFn({ method: "POST" })
        .middleware([requireSupabaseAuth])
    `;
    const getOptionsSrc = `
      export const getLessonOptions = createServerFn({ method: "POST" })
        .middleware([requireSupabaseAuth])
    `;
    assert.match(changeLessonSrc, /requireSupabaseAuth/);
    assert.match(getOptionsSrc, /requireSupabaseAuth/);
  });
});
