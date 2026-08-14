import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import {
  HomeworkService,
  toHomeworkStatus,
  type HomeworkCreateInput,
} from "./homework.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: { homework: Row[]; lesson_sessions: Row[] }) {
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
        order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
          state.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        async maybeSingle() {
          if (state.op === "insert") {
            const target = db[table as keyof typeof db] ?? [];
            const row = state.insertRows[0];
            if (!row) return { data: null, error: null };
            const inserted = {
              id: `hw-${target.length + 1}`,
              created_at: "2026-08-14T00:00:00Z",
              updated_at: "2026-08-14T00:00:00Z",
              instructions: "",
              subject: null,
              grade: null,
              class_name: null,
              due_date: null,
              status: "draft",
              lesson_session_id: null,
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
            Object.assign(current, state.patch, { updated_at: "2026-08-14T12:00:00Z" });
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
          return Promise.resolve({ data: runSelect(), error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(
  db: { homework: Row[]; lesson_sessions: Row[] },
  userId = TEACHER_A,
): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function createInput(overrides: Partial<HomeworkCreateInput> = {}): HomeworkCreateInput {
  return {
    title: "واجب الميزان الصرفي",
    instructions: "حل التمارين 1–5",
    subject: "لغة عربية",
    grade: "الأول متوسط",
    className: "1/A",
    dueDate: "2026-08-20",
    status: "draft",
    ...overrides,
  };
}

describe("Homework status helpers", () => {
  it("maps known statuses and falls back unknown → draft", () => {
    assert.equal(toHomeworkStatus("assigned"), "assigned");
    assert.equal(toHomeworkStatus("corrected"), "corrected");
    assert.equal(toHomeworkStatus("legacy"), "draft");
  });
});

describe("TASK 20.3 HomeworkService", () => {
  it("creates homework for the authenticated teacher only", async () => {
    const db = { homework: [] as Row[], lesson_sessions: [] as Row[] };
    const created = await HomeworkService.create(createInput(), authFor(db));

    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(created.title, "واجب الميزان الصرفي");
    assert.equal(created.status, "draft");
    assert.equal(db.homework.length, 1);
    assert.equal(db.homework[0]?.teacher_id, TEACHER_A);
  });

  it("lists only the authenticated teacher's homework", async () => {
    const db = {
      homework: [
        {
          id: "mine",
          teacher_id: TEACHER_A,
          title: "واجبي",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: "2026-08-20",
          status: "assigned",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
        {
          id: "theirs",
          teacher_id: TEACHER_B,
          title: "واجبهم",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: "2026-08-20",
          status: "assigned",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };

    const list = await HomeworkService.list({}, authFor(db, TEACHER_A));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "mine");
  });

  it("filters by status", async () => {
    const db = {
      homework: [
        {
          id: "d1",
          teacher_id: TEACHER_A,
          title: "مسودة",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: null,
          status: "draft",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
        {
          id: "a1",
          teacher_id: TEACHER_A,
          title: "مُسند",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: null,
          status: "assigned",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };

    const list = await HomeworkService.list({ status: "assigned" }, authFor(db));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "a1");
  });

  it("updates an owned homework row", async () => {
    const db = {
      homework: [
        {
          id: "hw-1",
          teacher_id: TEACHER_A,
          title: "قديم",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: null,
          status: "draft",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };

    const updated = await HomeworkService.update(
      "hw-1",
      { title: "جديد", status: "assigned" },
      authFor(db),
    );

    assert.ok(updated);
    assert.equal(updated.title, "جديد");
    assert.equal(updated.status, "assigned");
    assert.equal(db.homework[0]?.title, "جديد");
  });

  it("ownership — cannot update or delete another teacher's homework", async () => {
    const db = {
      homework: [
        {
          id: "hw-b",
          teacher_id: TEACHER_B,
          title: "خاص",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: null,
          status: "draft",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };

    const updated = await HomeworkService.update("hw-b", { title: "اختراق" }, authFor(db, TEACHER_A));
    assert.equal(updated, null);
    assert.equal(db.homework[0]?.title, "خاص");

    const deleted = await HomeworkService.delete("hw-b", authFor(db, TEACHER_A));
    assert.equal(deleted, false);
    assert.equal(db.homework.length, 1);
  });

  it("deletes an owned homework row", async () => {
    const db = {
      homework: [
        {
          id: "hw-1",
          teacher_id: TEACHER_A,
          title: "للحذف",
          instructions: "",
          subject: null,
          grade: null,
          class_name: null,
          due_date: null,
          status: "draft",
          lesson_session_id: null,
          created_at: "2026-08-14T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
        },
      ] as Row[],
      lesson_sessions: [] as Row[],
    };

    const deleted = await HomeworkService.delete("hw-1", authFor(db));
    assert.equal(deleted, true);
    assert.equal(db.homework.length, 0);
  });

  it("binds to an owned lesson session", async () => {
    const db = {
      homework: [] as Row[],
      lesson_sessions: [
        {
          id: SESSION_A,
          teacher_id: TEACHER_A,
        },
      ] as Row[],
    };

    const created = await HomeworkService.create(
      createInput({ lessonSessionId: SESSION_A }),
      authFor(db),
    );

    assert.ok(created);
    assert.equal(created.lessonSessionId, SESSION_A);
    assert.equal(db.homework[0]?.lesson_session_id, SESSION_A);
  });

  it("rejects linking another teacher's lesson session", async () => {
    const db = {
      homework: [] as Row[],
      lesson_sessions: [
        {
          id: SESSION_B,
          teacher_id: TEACHER_B,
        },
      ] as Row[],
    };

    await assert.rejects(
      () => HomeworkService.create(createInput({ lessonSessionId: SESSION_B }), authFor(db)),
      /الحصة المرتبطة/,
    );
    assert.equal(db.homework.length, 0);
  });

  it("requires a non-empty title", async () => {
    const db = { homework: [] as Row[], lesson_sessions: [] as Row[] };
    await assert.rejects(
      () => HomeworkService.create(createInput({ title: "   " }), authFor(db)),
      /عنوان الواجب/,
    );
  });

  it("does not accept client teacher_id as authority (insert uses auth userId)", async () => {
    const db = { homework: [] as Row[], lesson_sessions: [] as Row[] };
    const created = await HomeworkService.create(createInput(), authFor(db, TEACHER_A));

    assert.ok(created);
    assert.equal(created.teacherId, TEACHER_A);
    assert.equal(db.homework[0]?.teacher_id, TEACHER_A);
    assert.notEqual(db.homework[0]?.teacher_id, TEACHER_B);
  });
});
