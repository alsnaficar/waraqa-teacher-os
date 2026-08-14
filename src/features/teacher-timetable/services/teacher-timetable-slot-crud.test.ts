import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  isTimetableUniqueViolation,
  TeacherTimetableService,
  TimetableSlotConflictError,
} from "./teacher-timetable.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: { teacher_timetable: Row[]; lesson_sessions: Row[] }) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        op: "select" | "insert" | "update" | "delete" | null;
        insertRows: Row[];
        patch: Record<string, unknown>;
        orders: Array<{ column: string; ascending: boolean }>;
      } = {
        filters: {},
        op: null,
        insertRows: [],
        patch: {},
        orders: [],
      };

      const runSelect = (): Row[] => {
        let rows = [...(db[table as keyof typeof db] ?? [])];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => row[column] === value);
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
        select(_columns?: string) {
          if (state.op !== "insert" && state.op !== "update" && state.op !== "delete") {
            state.op = "select";
          }
          return chain;
        },
        insert(rows: Row | Row[]) {
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
        order(column: string, opts?: { ascending?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          if (state.op === "insert") {
            const target = db[table as keyof typeof db] ?? [];
            const row = state.insertRows[0];
            if (!row) return { data: null, error: null };

            if (table === "teacher_timetable") {
              const clash = target.some(
                (existing) =>
                  existing.teacher_id === row.teacher_id &&
                  existing.day_of_week === row.day_of_week &&
                  existing.period === row.period,
              );
              if (clash) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                };
              }
            }

            const inserted = {
              id: `tt-${target.length + 1}`,
              created_at: "2026-08-14T00:00:00Z",
              updated_at: "2026-08-14T00:00:00Z",
              active: true,
              classroom: null,
              starts_at: null,
              ends_at: null,
              ...row,
            };
            target.push(inserted);
            return { data: { ...inserted }, error: null };
          }

          if (state.op === "update") {
            const target = (db[table as keyof typeof db] ?? []).filter((row) =>
              matchesEq(row, state.filters),
            );
            const current = target[0];
            if (!current) return { data: null, error: null };

            const next: Row = { ...current, ...state.patch, updated_at: "2026-08-14T12:00:00Z" };
            if (table === "teacher_timetable") {
              const clash = (db.teacher_timetable ?? []).some(
                (existing) =>
                  existing.id !== current.id &&
                  existing.teacher_id === (next.teacher_id ?? current.teacher_id) &&
                  existing.day_of_week === (next.day_of_week ?? current.day_of_week) &&
                  existing.period === (next.period ?? current.period),
              );
              if (clash) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                };
              }
            }
            Object.assign(current, next);
            return { data: { ...current }, error: null };
          }

          if (state.op === "delete") {
            const rows = db[table as keyof typeof db] ?? [];
            const idx = rows.findIndex((row) => matchesEq(row, state.filters));
            if (idx < 0) return { data: null, error: null };
            const [removed] = rows.splice(idx, 1);
            return { data: removed ? { id: removed.id } : null, error: null };
          }

          const rows = runSelect();
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (state.op === "insert") {
            const target = db[table as keyof typeof db] ?? (db[table as keyof typeof db] = []);
            for (const row of state.insertRows) {
              if (table === "teacher_timetable") {
                const clash = target.some(
                  (existing) =>
                    existing.teacher_id === row.teacher_id &&
                    existing.day_of_week === row.day_of_week &&
                    existing.period === row.period,
                );
                if (clash) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "23505", message: "duplicate key" },
                  }).then(resolve, reject);
                }
              }
              target.push({
                id: `tt-${target.length + 1}`,
                created_at: "2026-08-14T00:00:00Z",
                updated_at: "2026-08-14T00:00:00Z",
                active: true,
                classroom: null,
                starts_at: null,
                ends_at: null,
                ...row,
              });
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }

          if (state.op === "delete") {
            const rows = db[table as keyof typeof db] ?? [];
            for (let i = rows.length - 1; i >= 0; i -= 1) {
              if (matchesEq(rows[i]!, state.filters)) rows.splice(i, 1);
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

function authFor(
  db: { teacher_timetable: Row[]; lesson_sessions: Row[] },
  userId = TEACHER_A,
): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function slotInput(overrides: Partial<Parameters<typeof TeacherTimetableService.addSlot>[0]> = {}) {
  return {
    dayOfWeek: 0,
    period: 1,
    subject: "لغة عربية",
    grade: "الأول متوسط",
    className: "1/A",
    classroom: "مختبر",
    startsAt: "07:30:00",
    endsAt: "08:15:00",
    active: true,
    ...overrides,
  };
}

describe("TimetableSlotConflictError helpers", () => {
  it("detects Postgres unique violation codes and messages", () => {
    assert.equal(isTimetableUniqueViolation({ code: "23505" }), true);
    assert.equal(isTimetableUniqueViolation({ message: "idx_teacher_timetable_unique_slot" }), true);
    assert.equal(isTimetableUniqueViolation({ code: "42501" }), false);
  });

  it("Arabic conflict message is stable", () => {
    const err = new TimetableSlotConflictError();
    assert.match(err.message, /نفس اليوم ونفس رقم الحصة/);
  });
});

describe("TASK 18.2 TeacherTimetableService slot CRUD", () => {
  it("adds a slot for the authenticated teacher", async () => {
    const db = { teacher_timetable: [] as Row[], lesson_sessions: [] as Row[] };
    const auth = authFor(db);

    const created = await TeacherTimetableService.addSlot(slotInput(), auth);

    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.period, 1);
    assert.equal(created.subject, "لغة عربية");
    assert.equal(db.teacher_timetable.length, 1);
    assert.equal(db.teacher_timetable[0]?.teacher_id, TEACHER_A);
  });

  it("updates an owned slot", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db);

    const updated = await TeacherTimetableService.updateSlot(
      "slot-1",
      { subject: "رياضيات", classroom: "101" },
      auth,
    );

    assert.ok(updated);
    assert.equal(updated.subject, "رياضيات");
    assert.equal(updated.classroom, "101");
    assert.equal(db.teacher_timetable[0]?.subject, "رياضيات");
  });

  it("deletes an owned slot", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db);

    const deleted = await TeacherTimetableService.deleteSlot("slot-1", auth);
    assert.equal(deleted, true);
    assert.equal(db.teacher_timetable.length, 0);
  });

  it("ownership — cannot update or delete another teacher's slot", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-b",
          teacher_id: TEACHER_B,
          day_of_week: 0,
          period: 1,
          subject: "علوم",
          grade: "الأول متوسط",
          class_name: "1/B",
          classroom: null,
          starts_at: null,
          ends_at: null,
          active: true,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db, TEACHER_A);

    const updated = await TeacherTimetableService.updateSlot("slot-b", { subject: "اختراق" }, auth);
    assert.equal(updated, null);
    assert.equal(db.teacher_timetable[0]?.subject, "علوم");

    const deleted = await TeacherTimetableService.deleteSlot("slot-b", auth);
    assert.equal(deleted, false);
    assert.equal(db.teacher_timetable.length, 1);
  });

  it("duplicate slot raises Arabic TimetableSlotConflictError", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db);

    await assert.rejects(
      () => TeacherTimetableService.addSlot(slotInput({ dayOfWeek: 0, period: 1 }), auth),
      (err: unknown) =>
        err instanceof TimetableSlotConflictError &&
        /نفس اليوم ونفس رقم الحصة/.test(err.message),
    );
  });

  it("duplicate update raises Arabic TimetableSlotConflictError", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
          id: "slot-2",
          teacher_id: TEACHER_A,
          day_of_week: 0,
          period: 2,
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
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db);

    await assert.rejects(
      () => TeacherTimetableService.updateSlot("slot-2", { period: 1 }, auth),
      (err: unknown) =>
        err instanceof TimetableSlotConflictError &&
        /نفس اليوم ونفس رقم الحصة/.test(err.message),
    );
  });

  it("lesson_sessions remain untouched when deleting a slot", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
      ] as Row[],
      lesson_sessions: [
        {
          id: "session-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
          period_number: 1,
          status: "prepared",
          lesson_locked: true,
          curriculum_lesson_id: "lesson-a",
        },
      ] as Row[],
    };
    const auth = authFor(db);
    const before = structuredClone(db.lesson_sessions);

    await TeacherTimetableService.deleteSlot("slot-1", auth);

    assert.equal(db.teacher_timetable.length, 0);
    assert.deepEqual(db.lesson_sessions, before);
  });

  it("lesson_sessions remain untouched when updating a slot", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "slot-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
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
      ] as Row[],
      lesson_sessions: [
        {
          id: "session-1",
          teacher_id: TEACHER_A,
          day_of_week: 0,
          period_number: 1,
          status: "prepared",
          lesson_locked: true,
          curriculum_lesson_id: "lesson-a",
        },
      ] as Row[],
    };
    const auth = authFor(db);
    const before = structuredClone(db.lesson_sessions);

    await TeacherTimetableService.updateSlot("slot-1", { subject: "علوم", classroom: "مختبر" }, auth);

    assert.equal(db.teacher_timetable[0]?.subject, "علوم");
    assert.deepEqual(db.lesson_sessions, before);
  });

  it("saveTimetable wholesale replace remains functional for Madrasati", async () => {
    const db = {
      teacher_timetable: [
        {
          id: "old",
          teacher_id: TEACHER_A,
          day_of_week: 0,
          period: 1,
          subject: "قديم",
          grade: "الأول متوسط",
          class_name: "1/A",
          classroom: null,
          starts_at: null,
          ends_at: null,
          active: true,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };
    const auth = authFor(db);

    await TeacherTimetableService.saveTimetable(
      [
        slotInput({ dayOfWeek: 1, period: 2, subject: "مستورد" }),
        slotInput({ dayOfWeek: 2, period: 3, subject: "مستورد-2" }),
      ],
      auth,
    );

    assert.equal(db.teacher_timetable.length, 2);
    assert.ok(db.teacher_timetable.every((row) => row.teacher_id === TEACHER_A));
    assert.ok(db.teacher_timetable.some((row) => row.subject === "مستورد"));
    assert.equal(
      db.teacher_timetable.some((row) => row.subject === "قديم"),
      false,
    );
  });
});
