import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { loadLessonOptionsForOwnedSessions } from "./lesson-options.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const YEAR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEMESTER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const MATH_FILE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MATH_OLD_FILE = "99999999-9999-4999-8999-999999999999";
const SCIENCE_FILE = "88888888-8888-4888-8888-888888888888";
const DRAFT_FILE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const MATH_LESSON_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATH_LESSON_2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const MATH_OLD_LESSON = "33333333-cccc-4ccc-8ccc-cccccccccccc";
const SCIENCE_LESSON = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRAFT_LESSON_B = "44444444-dddd-4ddd-8ddd-dddddddddddd";

const MATH_SUBJECT = "رياضيات";
const SCIENCE_SUBJECT = "علوم";
const GRADE = "الأول متوسط";

type Row = Record<string, unknown>;
type QueryCounters = {
  lesson_sessions: number;
  teacher_timetable: number;
  curriculum_files: number;
  curriculum_lessons: number;
};

const here = path.dirname(fileURLToPath(import.meta.url));

function sessionId(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${String(index).padStart(2, "0")}`;
}

function makeSessionRow(overrides: Partial<Row> = {}): Row {
  return {
    id: sessionId(1),
    teacher_id: TEACHER_A,
    academic_year_id: YEAR_ID,
    semester_id: SEMESTER_ID,
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: MATH_LESSON_1,
    curriculum_lesson_source: "plan",
    session_date: "2026-08-09",
    day_of_week: 0,
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

function seedDb(sessions: Row[]): Record<string, Row[]> {
  return {
    lesson_sessions: sessions,
    teacher_timetable: [
      {
        id: "tt-math",
        teacher_id: TEACHER_A,
        day_of_week: 0,
        period: 1,
        subject: MATH_SUBJECT,
        grade: GRADE,
        class_name: "1/1",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-science",
        teacher_id: TEACHER_A,
        day_of_week: 0,
        period: 2,
        subject: SCIENCE_SUBJECT,
        grade: GRADE,
        class_name: "1/1",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-b",
        teacher_id: TEACHER_B,
        day_of_week: 0,
        period: 1,
        subject: "كيمياء",
        grade: GRADE,
        class_name: "2/1",
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
        id: MATH_FILE,
        user_id: TEACHER_A,
        subject: MATH_SUBJECT,
        grade: GRADE,
        status: "published",
        created_at: "2026-08-10T00:00:00Z",
      },
      {
        id: MATH_OLD_FILE,
        user_id: TEACHER_A,
        subject: MATH_SUBJECT,
        grade: GRADE,
        status: "published",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: SCIENCE_FILE,
        user_id: TEACHER_A,
        subject: SCIENCE_SUBJECT,
        grade: GRADE,
        status: "published",
        created_at: "2026-08-10T00:00:00Z",
      },
      {
        id: DRAFT_FILE_B,
        user_id: TEACHER_B,
        subject: MATH_SUBJECT,
        grade: GRADE,
        status: "draft",
        created_at: "2026-08-11T00:00:00Z",
      },
    ],
    curriculum_lessons: [
      {
        id: MATH_LESSON_2,
        user_id: TEACHER_A,
        curriculum_file_id: MATH_FILE,
        title: "درس رياضي 2",
        objectives: null,
        notes: null,
        order_index: 2,
      },
      {
        id: MATH_LESSON_1,
        user_id: TEACHER_A,
        curriculum_file_id: MATH_FILE,
        title: "درس رياضي 1",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: MATH_OLD_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: MATH_OLD_FILE,
        title: "درس ملف قديم",
        objectives: null,
        notes: null,
        order_index: 1,
      },
      {
        id: SCIENCE_LESSON,
        user_id: TEACHER_A,
        curriculum_file_id: SCIENCE_FILE,
        title: "درس علوم",
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
    ],
  };
}

function tenMathSessions(): Row[] {
  return Array.from({ length: 10 }, (_, index) =>
    makeSessionRow({
      id: sessionId(index + 1),
      session_date: `2026-08-${String(9 + (index % 5)).padStart(2, "0")}`,
      curriculum_lesson_id: index % 2 === 0 ? MATH_LESSON_1 : MATH_LESSON_2,
    }),
  );
}

function createMockClient(
  db: Record<string, Row[]>,
  counters: QueryCounters,
): SupabaseUserContext["client"] {
  const client = {
    from(table: string) {
      if (table in counters) {
        counters[table as keyof QueryCounters] += 1;
      }

      const state: {
        filters: Record<string, unknown>;
        inFilters: Array<[string, unknown[]]>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        inFilters: [],
        orders: [],
      };

      const runRows = (): Row[] => {
        let rows = [...(db[table] ?? [])];

        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }

        for (const [column, values] of state.inFilters) {
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

        return rows;
      };

      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        in(column: string, values: unknown[]) {
          state.inFilters.push([column, values]);
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          const rows = runRows();
          return { data: rows[0] ?? null, error: null };
        },
        async then(resolve: (value: unknown) => unknown) {
          return resolve({ data: runRows(), error: null });
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(
  db: Record<string, Row[]>,
  counters: QueryCounters,
  userId = TEACHER_A,
): SupabaseUserContext {
  return { client: createMockClient(db, counters), userId };
}

function emptyCounters(): QueryCounters {
  return {
    lesson_sessions: 0,
    teacher_timetable: 0,
    curriculum_files: 0,
    curriculum_lessons: 0,
  };
}

describe("TASK 25.36 batched weekly lesson options", () => {
  it("loads 10 same-scope sessions with one session, timetable, file, and catalog read", async () => {
    const db = seedDb(tenMathSessions());
    const counters = emptyCounters();
    const ids = tenMathSessions().map((row) => String(row.id));

    const result = await loadLessonOptionsForOwnedSessions(ids, authFor(db, counters));

    assert.equal(Object.keys(result).length, 10);
    assert.equal(counters.lesson_sessions, 1);
    assert.equal(counters.teacher_timetable, 1);
    assert.equal(counters.curriculum_files, 1);
    assert.equal(counters.curriculum_lessons, 1);

    const first = result[sessionId(1)];
    assert.ok(first);
    assert.deepEqual(
      first.lessons.map((lesson) => lesson.id),
      [MATH_LESSON_1, MATH_LESSON_2],
    );
    assert.equal(first.selectedLessonId, MATH_LESSON_1);
    assert.equal(
      first.lessons.some((lesson) => lesson.id === MATH_OLD_LESSON),
      false,
    );
    assert.equal(
      first.lessons.some((lesson) => lesson.id === DRAFT_LESSON_B),
      false,
    );
    assert.equal(
      first.lessons.some((lesson) => lesson.id === SCIENCE_LESSON),
      false,
    );
  });

  it("reuses one catalog read when sessions span two curriculum scopes", async () => {
    const sessions = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeSessionRow({
          id: sessionId(index + 1),
          period_number: 1,
          curriculum_lesson_id: MATH_LESSON_1,
        }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        makeSessionRow({
          id: sessionId(index + 6),
          period_number: 2,
          curriculum_lesson_id: SCIENCE_LESSON,
        }),
      ),
    ];
    const db = seedDb(sessions);
    const counters = emptyCounters();
    const ids = sessions.map((row) => String(row.id));

    const result = await loadLessonOptionsForOwnedSessions(ids, authFor(db, counters));

    assert.equal(Object.keys(result).length, 10);
    assert.equal(counters.curriculum_files, 1);
    assert.equal(counters.curriculum_lessons, 1);
    assert.equal(counters.lesson_sessions, 1);
    assert.equal(counters.teacher_timetable, 1);

    assert.deepEqual(
      result[sessionId(1)]?.lessons.map((lesson) => lesson.id),
      [MATH_LESSON_1, MATH_LESSON_2],
    );
    assert.deepEqual(
      result[sessionId(6)]?.lessons.map((lesson) => lesson.id),
      [SCIENCE_LESSON],
    );
    assert.equal(result[sessionId(6)]?.selectedLessonId, SCIENCE_LESSON);
  });

  it("enforces teacher ownership and does not load another teacher's curriculum", async () => {
    const owned = tenMathSessions();
    const foreign = makeSessionRow({
      id: sessionId(11),
      teacher_id: TEACHER_B,
      curriculum_lesson_id: DRAFT_LESSON_B,
    });
    const db = seedDb([...owned, foreign]);
    const counters = emptyCounters();
    const ids = [...owned.map((row) => String(row.id)), String(foreign.id)];

    const teacherA = await loadLessonOptionsForOwnedSessions(ids, authFor(db, counters));
    assert.equal(Object.keys(teacherA).length, 10);
    assert.equal(teacherA[sessionId(11)], undefined);
    assert.equal(counters.curriculum_files, 1);

    const teacherBCounters = emptyCounters();
    const teacherB = await loadLessonOptionsForOwnedSessions(
      ids,
      authFor(db, teacherBCounters, TEACHER_B),
    );

    assert.deepEqual(Object.keys(teacherB), [sessionId(11)]);
    assert.equal(teacherB[sessionId(1)], undefined);
    assert.equal(teacherB[sessionId(11)]?.selectedLessonId, DRAFT_LESSON_B);
    assert.deepEqual(teacherB[sessionId(11)]?.lessons, []);
    assert.equal(teacherBCounters.lesson_sessions, 1);
    assert.equal(teacherBCounters.curriculum_files, 1);
    assert.equal(teacherBCounters.curriculum_lessons, 0);
  });

  it("omits other-teacher ids without catalog reads when none are owned", async () => {
    const db = seedDb(tenMathSessions());
    const counters = emptyCounters();
    const ids = tenMathSessions().map((row) => String(row.id));

    const result = await loadLessonOptionsForOwnedSessions(
      ids,
      authFor(db, counters, TEACHER_B),
    );

    assert.deepEqual(result, {});
    assert.equal(counters.lesson_sessions, 1);
    assert.equal(counters.teacher_timetable, 0);
    assert.equal(counters.curriculum_files, 0);
    assert.equal(counters.curriculum_lessons, 0);
  });

  it("keeps single-session options compatible with the published catalog", async () => {
    const db = seedDb([makeSessionRow()]);
    const counters = emptyCounters();

    const result = await loadLessonOptionsForOwnedSessions(
      [sessionId(1)],
      authFor(db, counters),
    );

    assert.equal(counters.lesson_sessions, 1);
    assert.equal(counters.curriculum_files, 1);
    assert.equal(counters.curriculum_lessons, 1);
    assert.deepEqual(
      result[sessionId(1)]?.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        order_index: lesson.order_index,
      })),
      [
        { id: MATH_LESSON_1, title: "درس رياضي 1", order_index: 1 },
        { id: MATH_LESSON_2, title: "درس رياضي 2", order_index: 2 },
      ],
    );
    assert.equal(result[sessionId(1)]?.selectedLessonId, MATH_LESSON_1);
  });

  it("does not import session generation in the shared loader", () => {
    const source = readFileSync(path.join(here, "lesson-options.ts"), "utf8");
    assert.doesNotMatch(source, /ensureSessionsForDate\(/);
    assert.doesNotMatch(source, /generateSessionsForDate\(/);
  });
});
