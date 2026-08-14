import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { CalculatedLessonEntry } from "@/features/planner/services/planner-engine";
import type { PlanEntryForTimetableMatch } from "./match-plan-entry-to-timetable-slot.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { collectUnlockedSessionCurriculumRefreshMatches } from "./session-curriculum-refresh.logic.ts";
import { toCurriculumLessonSource } from "../types.ts";

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const YEAR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEMESTER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LESSON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LESSON_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ALLOWED_FILE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SUNDAY_ISO = "2026-08-09";
const SUNDAY_DOW = 0;
const SUBJECT = "لغة عربية";
const GRADE = "الأول متوسط";
const CLASS_NAME = "1/A";

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
    className: CLASS_NAME,
    subject: SUBJECT,
    objectives: "",
    teachingResources: "",
    assessmentMethods: "",
    planNotes: "",
    lessonId,
    grade: GRADE,
    ...rest,
  };
}

function makeSessionRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "session-seed",
    teacher_id: TEACHER_ID,
    academic_year_id: YEAR_ID,
    semester_id: SEMESTER_ID,
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: LESSON_A,
    curriculum_lesson_source: "plan",
    session_date: SUNDAY_ISO,
    day_of_week: SUNDAY_DOW,
    period_number: 1,
    lesson_locked: false,
    status: "scheduled",
    prepared_at: null,
    completed_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function seedDb(sessions: Row[] = []): Record<string, Row[]> {
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
        subject: SUBJECT,
        grade: GRADE,
        class_name: CLASS_NAME,
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
        subject: SUBJECT,
        grade: GRADE,
        class_name: CLASS_NAME,
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    lesson_sessions: sessions,
    grades: [],
    classes: [],
    curriculum_files: [
      {
        id: ALLOWED_FILE,
        user_id: TEACHER_ID,
        subject: SUBJECT,
        grade: GRADE,
        status: "published",
        created_at: "2026-08-10T00:00:00Z",
      },
    ],
    curriculum_lessons: [
      {
        id: LESSON_A,
        title: "Lesson A",
        objectives: null,
        notes: null,
        curriculum_file_id: ALLOWED_FILE,
        order_index: 1,
      },
      {
        id: LESSON_B,
        title: "Lesson B",
        objectives: null,
        notes: null,
        curriculum_file_id: ALLOWED_FILE,
        order_index: 2,
      },
      {
        id: LESSON_C,
        title: "Lesson C",
        objectives: null,
        notes: null,
        curriculum_file_id: ALLOWED_FILE,
        order_index: 3,
      },
    ],
  };
}

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

type UpdateCounters = { lessonSessionUpdates: number };

function createMockClient(
  db: Record<string, Row[]>,
  counters?: UpdateCounters,
): SupabaseUserContext["client"] {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
        pendingIn: [string, unknown[]] | null;
        op: "select" | "upsert" | "update" | null;
        upsertRows: Row[];
        upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean };
        patch: Record<string, unknown>;
        limitN: number | null;
      } = {
        filters: {},
        orders: [],
        pendingIn: null,
        op: null,
        upsertRows: [],
        upsertOptions: {},
        patch: {},
        limitN: null,
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

        if (state.limitN != null) {
          rows = rows.slice(0, state.limitN);
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
          state.op = state.op === "update" ? "update" : "select";
          return chain;
        },
        upsert(rows: Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          state.op = "upsert";
          state.upsertRows = rows;
          state.upsertOptions = options ?? {};
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
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
          if (state.op === "update" && Object.keys(state.patch).length > 0) {
            const rows = (db[table] ?? []).filter((row) => matchesEq(row, state.filters));
            const target = rows[0];
            if (!target) return { data: null, error: null };
            if (table === "lesson_sessions" && counters) {
              counters.lessonSessionUpdates += 1;
            }
            Object.assign(target, state.patch, { updated_at: "2026-08-09T12:00:00Z" });
            return { data: { ...target }, error: null };
          }

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
                curriculum_lesson_source: "plan",
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

function authFor(db: Record<string, Row[]>, counters?: UpdateCounters): SupabaseUserContext {
  return { client: createMockClient(db, counters), userId: TEACHER_ID };
}

function planEntriesForTest(
  entries: PlanEntryForTimetableMatch[],
): { planEntries: CalculatedLessonEntry[] } {
  return { planEntries: entries };
}

describe("toCurriculumLessonSource", () => {
  it("accepts plan and manual", () => {
    assert.equal(toCurriculumLessonSource("plan"), "plan");
    assert.equal(toCurriculumLessonSource("manual"), "manual");
  });

  it("rejects invalid values without silent default", () => {
    assert.throws(() => toCurriculumLessonSource("unknown"), /Invalid curriculum_lesson_source/);
    assert.throws(() => toCurriculumLessonSource(""), /Invalid curriculum_lesson_source/);
  });
});

describe("TASK 8D curriculum_lesson_source", () => {
  beforeEach(() => {
    assert.equal(process.env.NODE_ENV, "test");
  });

  it("TEST 1 — planner-generated session has source plan", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([
        planEntry({ lessonId: LESSON_A, period: 1 }),
        planEntry({ lessonId: LESSON_B, period: 4 }),
      ]),
    );

    assert.equal(db.lesson_sessions.length, 2);
    for (const row of db.lesson_sessions) {
      assert.equal(row.curriculum_lesson_source, "plan");
    }

    const sessions = await LessonSessionService.getSessionsByDate(SUNDAY_ISO, auth);
    assert.ok(sessions.every((s) => s.curriculumLessonSource === "plan"));
  });

  it("TEST 2 — changeLesson sets source to manual", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    const result = await LessonSessionService.changeLesson("session-p1", LESSON_C, auth);

    assert.ok(result);
    assert.equal(result.curriculumLessonId, LESSON_C);
    assert.equal(result.curriculumLessonSource, "manual");
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_C);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "manual");
  });

  it("TEST 2b — changeLesson marks manual even when lesson equals plan lesson", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    const result = await LessonSessionService.changeLesson("session-p1", LESSON_A, auth);

    assert.ok(result);
    assert.equal(result.curriculumLessonId, LESSON_A);
    assert.equal(result.curriculumLessonSource, "manual");
  });

  it("TEST 3 — manual scheduled/unlocked session is NOT overwritten by refresh", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_C,
        curriculum_lesson_source: "manual",
      }),
    ]);
    const auth = authFor(db);

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_C);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "manual");
  });

  it("TEST 4 — plan-sourced scheduled/unlocked session IS refreshed", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_B);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 5 — preparing session cannot change curriculum_lesson_source (logic + service)", async () => {
    const matches = collectUnlockedSessionCurriculumRefreshMatches({
      sessions: [
        {
          id: "prep",
          status: "preparing",
          lessonLocked: false,
          curriculumLessonId: LESSON_A,
          curriculumLessonSource: "plan",
          dayOfWeek: SUNDAY_DOW,
          periodNumber: 1,
        },
      ],
      slots: [
        {
          dayOfWeek: SUNDAY_DOW,
          period: 1,
          subject: SUBJECT,
          grade: GRADE,
          className: CLASS_NAME,
        },
      ],
      plannedForDate: [planEntry({ lessonId: LESSON_B, period: 1 })],
      dayOfWeek: SUNDAY_DOW,
    });
    assert.equal(matches.length, 0);

    const db = seedDb([
      makeSessionRow({
        id: "session-prep",
        status: "preparing",
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson("session-prep", LESSON_C, auth),
      (err: unknown) => (err as { name?: string }).name === "LessonSessionPreparingError",
    );
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 6 — locked session remains protected from change and refresh", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-locked",
        status: "prepared",
        lesson_locked: true,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    await assert.rejects(
      () => LessonSessionService.changeLesson("session-locked", LESSON_C, auth),
      (err: unknown) => (err as { name?: string }).name === "LessonSessionLockedError",
    );

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 8 — DI-02 P1/P4 remain distinct with source plan", async () => {
    const db = seedDb();
    const auth = authFor(db);

    await LessonSessionService.generateSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([
        planEntry({ lessonId: LESSON_A, period: 1 }),
        planEntry({ lessonId: LESSON_B, period: 4 }),
      ]),
    );

    const sessions = await LessonSessionService.getSessionsByDate(SUNDAY_ISO, auth);
    const p1 = sessions.find((s) => s.periodNumber === 1);
    const p4 = sessions.find((s) => s.periodNumber === 4);

    assert.ok(p1 && p4);
    assert.notEqual(p1.id, p4.id);
    assert.equal(p1.curriculumLessonId, LESSON_A);
    assert.equal(p4.curriculumLessonId, LESSON_B);
    assert.equal(p1.curriculumLessonSource, "plan");
    assert.equal(p4.curriculumLessonSource, "plan");
  });

  it("TEST 9 — idempotent generation remains intact", async () => {
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

  it("refresh skips zero and ambiguous DI-02 matches", () => {
    const slot = {
      dayOfWeek: SUNDAY_DOW,
      period: 1,
      subject: SUBJECT,
      grade: GRADE,
      className: CLASS_NAME,
    };
    const session = {
      id: "s1",
      status: "scheduled" as const,
      lessonLocked: false,
      curriculumLessonId: LESSON_A,
      curriculumLessonSource: "plan" as const,
      dayOfWeek: SUNDAY_DOW,
      periodNumber: 1,
    };

    assert.equal(
      collectUnlockedSessionCurriculumRefreshMatches({
        sessions: [session],
        slots: [slot],
        plannedForDate: [],
        dayOfWeek: SUNDAY_DOW,
      }).length,
      0,
    );

    assert.equal(
      collectUnlockedSessionCurriculumRefreshMatches({
        sessions: [session],
        slots: [slot],
        plannedForDate: [
          planEntry({ lessonId: LESSON_B, period: 1 }),
          planEntry({ lessonId: LESSON_C, period: 1 }),
        ],
        dayOfWeek: SUNDAY_DOW,
      }).length,
      0,
    );
  });
});

const FOREIGN_FILE = "99999999-9999-4999-8999-999999999999";
const FOREIGN_LESSON = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";

describe("TASK 11 ensureSessionsForDate P2 refresh", () => {
  beforeEach(() => {
    assert.equal(process.env.NODE_ENV, "test");
  });

  it("TEST 1 — ENSURE_REFRESHES_STALE_PLAN", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    const result = await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0]?.id, "session-p1");
    assert.equal(result.sessions[0]?.curriculumLessonId, LESSON_B);
    assert.equal(result.sessions[0]?.curriculumLessonSource, "plan");
    assert.equal(db.lesson_sessions[0]?.id, "session-p1");
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_B);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 2 — ENSURE_PROTECTS_MANUAL", async () => {
    const counters: UpdateCounters = { lessonSessionUpdates: 0 };
    const db = seedDb([
      makeSessionRow({
        id: "session-manual",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "manual",
      }),
    ]);
    const auth = authFor(db, counters);

    await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "manual");
    assert.equal(counters.lessonSessionUpdates, 0);
  });

  it("TEST 3 — ENSURE_PROTECTS_LOCKED", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-locked",
        period_number: 1,
        status: "prepared",
        lesson_locked: true,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 4 — ENSURE_PROTECTS_PREPARING", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-prep",
        period_number: 1,
        status: "preparing",
        lesson_locked: false,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
  });

  it("TEST 5 — ENSURE_AMBIGUOUS_MATCH", async () => {
    const counters: UpdateCounters = { lessonSessionUpdates: 0 };
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db, counters);

    await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([
        planEntry({ lessonId: LESSON_B, period: 1 }),
        planEntry({ lessonId: LESSON_C, period: 1 }),
      ]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(counters.lessonSessionUpdates, 0);
  });

  it("TEST 6 — ENSURE_UNAUTHORIZED_REFRESH", async () => {
    const counters: UpdateCounters = { lessonSessionUpdates: 0 };
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    db.curriculum_files.push({
      id: FOREIGN_FILE,
      user_id: TEACHER_ID,
      subject: SUBJECT,
      grade: GRADE,
      status: "draft",
      created_at: "2026-08-11T00:00:00Z",
    });
    db.curriculum_lessons.push({
      id: FOREIGN_LESSON,
      title: "Foreign Lesson",
      objectives: null,
      notes: null,
      curriculum_file_id: FOREIGN_FILE,
      order_index: 99,
    });
    const auth = authFor(db, counters);

    await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: FOREIGN_LESSON, period: 1 })]),
    );

    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_id, LESSON_A);
    assert.equal(db.lesson_sessions[0]?.curriculum_lesson_source, "plan");
    assert.equal(counters.lessonSessionUpdates, 0);
  });

  it("TEST 7 — ENSURE_IDEMPOTENT", async () => {
    const counters: UpdateCounters = { lessonSessionUpdates: 0 };
    const db = seedDb([
      makeSessionRow({
        id: "session-p1",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db, counters);
    const testPlan = planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]);

    const first = await LessonSessionService.ensureSessionsForDate(SUNDAY_ISO, auth, testPlan);
    assert.equal(first.sessions[0]?.id, "session-p1");
    assert.equal(first.sessions[0]?.curriculumLessonId, LESSON_B);
    assert.equal(counters.lessonSessionUpdates, 1);
    assert.equal(db.lesson_sessions.length, 1);

    const second = await LessonSessionService.ensureSessionsForDate(SUNDAY_ISO, auth, testPlan);
    assert.equal(second.sessions[0]?.id, "session-p1");
    assert.equal(second.sessions[0]?.curriculumLessonId, LESSON_B);
    assert.equal(second.sessions[0]?.curriculumLessonSource, "plan");
    assert.equal(counters.lessonSessionUpdates, 1);
    assert.equal(db.lesson_sessions.length, 1);
  });
});

describe("TASK 17 today ensure path (ownership + P2)", () => {
  beforeEach(() => {
    assert.equal(process.env.NODE_ENV, "test");
  });

  it("D. TEACHER_OWNERSHIP — ensure only returns the authenticated teacher's sessions", async () => {
    const otherTeacher = "22222222-2222-4222-8222-222222222222";
    const db = seedDb([
      makeSessionRow({
        id: "mine",
        teacher_id: TEACHER_ID,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
      }),
      makeSessionRow({
        id: "theirs",
        teacher_id: otherTeacher,
        period_number: 4,
        curriculum_lesson_id: LESSON_B,
        curriculum_lesson_source: "plan",
      }),
    ]);
    const auth = authFor(db);

    const result = await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_A, period: 1 })]),
    );

    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0]?.id, "mine");
    assert.equal(result.sessions[0]?.teacherId, TEACHER_ID);
    assert.ok(result.sessions.every((s) => s.id !== "theirs"));
  });

  it("H. STALE_PLAN_REFRESH — ensure refreshes unlocked plan session (today path)", async () => {
    const db = seedDb([
      makeSessionRow({
        id: "session-today",
        period_number: 1,
        curriculum_lesson_id: LESSON_A,
        curriculum_lesson_source: "plan",
        status: "scheduled",
        lesson_locked: false,
      }),
    ]);
    const auth = authFor(db);

    const result = await LessonSessionService.ensureSessionsForDate(
      SUNDAY_ISO,
      auth,
      planEntriesForTest([planEntry({ lessonId: LESSON_B, period: 1 })]),
    );

    assert.equal(result.sessions[0]?.id, "session-today");
    assert.equal(result.sessions[0]?.curriculumLessonId, LESSON_B);
    assert.equal(result.sessions[0]?.curriculumLessonSource, "plan");
  });
});
