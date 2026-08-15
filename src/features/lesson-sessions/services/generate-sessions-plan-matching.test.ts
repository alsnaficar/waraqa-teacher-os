import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import type { PlanEntryForTimetableMatch } from "./match-plan-entry-to-timetable-slot.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEMESTER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LESSON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUNDAY_ISO = "2026-08-09";
const SUNDAY_DOW = 0;

type Row = Record<string, unknown>;

const { LessonSessionService } = await import("./lesson-session.service.ts");

function planEntry(
  overrides: Partial<PlanEntryForTimetableMatch> & { lessonId: string; period: number },
): PlanEntryForTimetableMatch {
  const { period, lessonId, ...rest } = overrides;
  return {
    id: `row-${period}-${lessonId}`,
    academicYear: "1447",
    semester: "s1",
    weekNumber: 1,
    teachingWeek: 1,
    suggestedDate: SUNDAY_ISO,
    dayOfWeek: SUNDAY_DOW,
    period,
    unit: "U1",
    lessonTitle: "درس",
    lessonOrder: 1,
    periodsCount: 1,
    remainingPeriods: 0,
    status: "Upcoming",
    className: "1/A",
    subject: "لغة عربية",
    objectives: "",
    teachingResources: "",
    assessmentMethods: "",
    planNotes: "",
    lessonId,
    ...rest,
  };
}

function seedDb(): Record<string, Row[]> {
  return {
    academic_years: [
      {
        id: YEAR_ID,
        label: "1447",
        start_date: "2026-08-01",
        end_date: "2027-06-30",
        is_active: true,
      },
    ],
    semesters: [
      {
        id: SEMESTER_ID,
        label: "الفصل الأول",
        start_date: "2026-08-01",
        end_date: "2026-12-20",
        order_index: 1,
        academic_year_id: YEAR_ID,
      },
    ],
    teacher_timetable: [
      {
        id: "tt-p1",
        teacher_id: TEACHER_ID,
        day_of_week: SUNDAY_DOW,
        period: 1,
        subject: "لغة عربية",
        grade: "الأول متوسط",
        class_name: "1/A",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-p4",
        teacher_id: TEACHER_ID,
        day_of_week: SUNDAY_DOW,
        period: 4,
        subject: "لغة عربية",
        grade: "الأول متوسط",
        class_name: "1/A",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    lesson_sessions: [],
    grades: [],
    classes: [],
    curriculum_lessons: [
      {
        id: LESSON_A,
        title: "Lesson A",
        objectives: null,
        notes: null,
      },
      {
        id: LESSON_B,
        title: "Lesson B",
        objectives: null,
        notes: null,
      },
    ],
  };
}

function createMockClient(db: Record<string, Row[]>): SupabaseUserContext["client"] {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
        pendingIn: [string, unknown[]] | null;
        op: "select" | "upsert" | null;
        upsertRows: Row[];
        upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean };
      } = {
        filters: {},
        orders: [],
        pendingIn: null,
        op: null,
        upsertRows: [],
        upsertOptions: {},
      };

      const runSelect = (): Row[] => {
        let rows = [...(db[table] ?? [])];

        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
        }

        if (state.pendingIn) {
          const [column, values] = state.pendingIn;
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

      const conflictKey = (row: Row, onConflict: string): string => {
        return onConflict
          .split(",")
          .map((col) => String(row[col.trim()] ?? ""))
          .join("|");
      };

      const chain = {
        select(_columns?: string) {
          state.op = "select";
          return chain;
        },
        upsert(rows: Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          state.op = "upsert";
          state.upsertRows = rows;
          state.upsertOptions = options ?? {};
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
        async maybeSingle() {
          const rows = runSelect();
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (state.op === "upsert") {
            const target = db[table] ?? (db[table] = []);
            const onConflict = state.upsertOptions.onConflict ?? "";
            const ignoreDuplicates = state.upsertOptions.ignoreDuplicates ?? false;
            const indexByKey = new Map<string, Row>();

            for (const row of target) {
              indexByKey.set(conflictKey(row, onConflict), row);
            }

            for (const row of state.upsertRows) {
              const key = conflictKey(row, onConflict);
              const existing = indexByKey.get(key);
              if (existing) {
                if (!ignoreDuplicates) {
                  Object.assign(existing, row);
                }
                continue;
              }
              const inserted = {
                id: `session-${target.length + 1}`,
                created_at: "2026-08-09T00:00:00Z",
                updated_at: "2026-08-09T00:00:00Z",
                lesson_locked: false,
                status: "scheduled",
                prepared_at: null,
                completed_at: null,
                ...row,
              };
              target.push(inserted);
              indexByKey.set(key, inserted);
            }

            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }

          return Promise.resolve({ data: runSelect(), error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(db: Record<string, Row[]>): SupabaseUserContext {
  return { client: createMockClient(db), userId: TEACHER_ID };
}

function planEntriesForTest(
  entries: PlanEntryForTimetableMatch[],
): { planEntries: CalculatedLessonEntry[] } {
  return { planEntries: entries };
}

describe("generateSessionsForDate slot-aware plan matching", () => {
  beforeEach(() => {
    assert.equal(process.env.NODE_ENV, "test");
  });

  it("TEST 7 — generation remains idempotent (no duplicate sessions)", async () => {
    const db = seedDb();
    const auth = authFor(db);
    const testPlan = planEntriesForTest([
      planEntry({ lessonId: LESSON_A, period: 1 }),
      planEntry({ lessonId: LESSON_B, period: 4 }),
    ]);

    await LessonSessionService.generateSessionsForDate(SUNDAY_ISO, auth, testPlan);
    assert.equal(db.lesson_sessions.length, 2);

    await LessonSessionService.generateSessionsForDate(SUNDAY_ISO, auth, testPlan);
    assert.equal(db.lesson_sessions.length, 2);
  });

  it("TEST 9 MERGE BLOCKER — two periods same class/subject get distinct lessons and stable ids", async () => {
    const db = seedDb();
    const auth = authFor(db);
    const testPlan = planEntriesForTest([
      planEntry({ lessonId: LESSON_A, period: 1 }),
      planEntry({ lessonId: LESSON_B, period: 4 }),
    ]);

    await LessonSessionService.generateSessionsForDate(SUNDAY_ISO, auth, testPlan);

    const sessions = await LessonSessionService.getSessionsByDate(SUNDAY_ISO, auth);
    assert.equal(sessions.length, 2);

    const p1 = sessions.filter((s) => s.periodNumber === 1);
    const p4 = sessions.filter((s) => s.periodNumber === 4);
    assert.equal(p1.length, 1);
    assert.equal(p4.length, 1);
    assert.equal(p1[0]?.curriculumLessonId, LESSON_A);
    assert.equal(p4[0]?.curriculumLessonId, LESSON_B);

    const p1SessionId = p1[0]!.id;
    const p4SessionId = p4[0]!.id;

    await LessonSessionService.generateSessionsForDate(SUNDAY_ISO, auth, testPlan);

    const again = await LessonSessionService.getSessionsByDate(SUNDAY_ISO, auth);
    assert.equal(again.length, 2);

    const p1Again = again.find((s) => s.periodNumber === 1);
    const p4Again = again.find((s) => s.periodNumber === 4);

    assert.equal(p1Again?.id, p1SessionId);
    assert.equal(p4Again?.id, p4SessionId);
    assert.equal(p1Again?.curriculumLessonId, LESSON_A);
    assert.equal(p4Again?.curriculumLessonId, LESSON_B);
  });

  it("DI-02 integration — Math timetable slot ignores Science plan row for same period", async () => {
    const db = seedDb();
    db.teacher_timetable = [
      {
        id: "tt-math",
        teacher_id: TEACHER_ID,
        day_of_week: SUNDAY_DOW,
        period: 3,
        subject: "رياضيات",
        grade: "الأول متوسط",
        class_name: "1/A",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ];

    const auth = authFor(db);
    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([
        planEntry({
          lessonId: LESSON_A,
          period: 3,
          subject: "رياضيات",
          className: "1/A",
        }),
        planEntry({
          lessonId: LESSON_B,
          period: 3,
          subject: "علوم",
          className: "1/A",
        }),
      ]),
    );

    assert.equal(db.lesson_sessions.length, 1);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.period_number, 3);
  });

  it("TASK 25.4 — generation wires unique owned grade/class IDs from timetable names", async () => {
    const GRADE_ID = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";
    const CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const db = seedDb();
    db.grades = [{ id: GRADE_ID, user_id: TEACHER_ID, name: "الأول متوسط" }];
    db.classes = [
      { id: CLASS_ID, user_id: TEACHER_ID, name: "1/A", grade_id: GRADE_ID },
    ];

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      authFor(db),
      planEntriesForTest([
        planEntry({ lessonId: LESSON_A, period: 1 }),
        planEntry({ lessonId: LESSON_B, period: 4 }),
      ]),
    );

    assert.equal(db.lesson_sessions.length, 2);
    for (const row of db.lesson_sessions) {
      assert.equal(row.grade_id, GRADE_ID);
      assert.equal(row.class_id, CLASS_ID);
    }
  });

  it("TASK 25.4 — ambiguous class names leave grade/class IDs null", async () => {
    const GRADE_ID = "gggggggg-gggg-4ggg-8ggg-gggggggggggg";
    const db = seedDb();
    db.grades = [{ id: GRADE_ID, user_id: TEACHER_ID, name: "الأول متوسط" }];
    db.classes = [
      { id: "c1", user_id: TEACHER_ID, name: "1/A", grade_id: GRADE_ID },
      { id: "c2", user_id: TEACHER_ID, name: "1/A", grade_id: GRADE_ID },
    ];

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      authFor(db),
      planEntriesForTest([planEntry({ lessonId: LESSON_A, period: 1 })]),
    );

    assert.equal(db.lesson_sessions.length, 1);
    assert.equal(db.lesson_sessions[0]?.grade_id, null);
    assert.equal(db.lesson_sessions[0]?.class_id, null);
  });
});
