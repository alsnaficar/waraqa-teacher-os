import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { HomeworkAiImportService } from "./homework-ai-import.service.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";
const TEACHER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GEN_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;

type ImportMockDb = {
  homework: Row[];
  lesson_sessions: Row[];
  ai_generations: Row[];
};

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function createMockClient(db: ImportMockDb) {
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
        let rows = [...(db[table as keyof ImportMockDb] ?? [])];
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
            const target = db[table as keyof ImportMockDb] ?? [];
            const row = state.insertRows[0];
            if (!row) return { data: null, error: null };
            const inserted = {
              id: `hw-${target.length + 1}`,
              created_at: "2026-08-15T00:00:00Z",
              updated_at: "2026-08-15T00:00:00Z",
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
            const target = (db[table as keyof ImportMockDb] ?? []).filter((row) =>
              matchesEq(row, state.filters),
            );
            const current = target[0];
            if (!current) return { data: null, error: null };
            Object.assign(current, state.patch, { updated_at: "2026-08-15T12:00:00Z" });
            return { data: { ...current }, error: null };
          }

          if (state.op === "delete") {
            const rows = db[table as keyof ImportMockDb] ?? [];
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

function authFor(db: ImportMockDb, userId = TEACHER_A): SupabaseUserContext {
  return { client: createMockClient(db), userId };
}

function createEmptyDb(): ImportMockDb {
  return { homework: [], lesson_sessions: [], ai_generations: [] };
}

const SAMPLE_CONTENT = `# واجب الوحدة

1. السؤال الأول
2. السؤال الثاني`;

function seedOwnedWorksheet(
  db: ImportMockDb,
  overrides: Partial<Row> = {},
): string {
  const id = (overrides.id as string) ?? GEN_A;
  db.ai_generations.push({
    id,
    user_id: TEACHER_A,
    kind: "worksheet",
    lesson_session_id: SESSION_A,
    prompt: "واجب منزلي: الميزان الصرفي",
    output: {
      content: SAMPLE_CONTENT,
      input: {
        lessonSessionId: SESSION_A,
        subject: "لغة عربية",
        grade: "أول متوسط",
        title: "الميزان الصرفي",
        questionCount: 5,
        difficulty: "medium",
        homeworkType: "mixed",
        estimatedTime: 30,
      },
      model: "gemini-2.5-flash",
      lessonContext: {
        lessonSessionId: SESSION_A,
        curriculumLessonId: null,
        sessionStatus: "preparing",
      },
    },
    status: "completed",
    subject: "لغة عربية",
    grade: "أول متوسط",
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    version: 1,
    ...overrides,
  });
  if (!db.lesson_sessions.some((row) => row.id === SESSION_A)) {
    db.lesson_sessions.push({
      id: SESSION_A,
      teacher_id: TEACHER_A,
      curriculum_lesson_id: null,
      status: "preparing",
      day_of_week: 0,
      period_number: 1,
    });
  }
  return id;
}

describe("TASK 24 HomeworkAiImportService", () => {
  it("6-11. owned worksheet → draft homework; session preserved; generation unchanged; no entitlement/Gemini", async () => {
    const db = createEmptyDb();
    const generationId = seedOwnedWorksheet(db);
    const beforeOutput = structuredClone(db.ai_generations[0]?.output);

    const result = await HomeworkAiImportService.createDraftFromWorksheetGeneration(
      generationId,
      authFor(db),
    );

    assert.equal(result.reusedExisting, false);
    assert.equal(result.homework.status, "draft");
    assert.equal(result.homework.lessonSessionId, SESSION_A);
    assert.equal(result.homework.title, "واجب: الميزان الصرفي");
    assert.equal(result.homework.instructions, SAMPLE_CONTENT);
    assert.equal(result.homework.subject, "لغة عربية");
    assert.equal(result.homework.grade, "أول متوسط");
    assert.equal(result.homework.teacherId, TEACHER_A);

    assert.equal(db.homework.length, 1);
    assert.equal(db.homework[0]?.status, "draft");
    assert.equal(db.homework[0]?.lesson_session_id, SESSION_A);

    // generation unchanged
    assert.deepEqual(db.ai_generations[0]?.output, beforeOutput);
    assert.equal(db.ai_generations[0]?.kind, "worksheet");

    // source must not import / call AI providers or entitlement
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serviceSrc = readFileSync(path.join(here, "homework-ai-import.service.ts"), "utf8");
    assert.equal(/requireEntitlement|runSessionBoundGeneration|@google\/genai|aiOrchestrator/.test(serviceSrc), false);
    assert.match(serviceSrc, /HomeworkService\.create/);
    assert.match(serviceSrc, /from\(["']ai_generations["']\)/);
  });

  it("12. foreign generation rejected", async () => {
    const db = createEmptyDb();
    const generationId = seedOwnedWorksheet(db, { user_id: TEACHER_B });
    await assert.rejects(
      () =>
        HomeworkAiImportService.createDraftFromWorksheetGeneration(generationId, authFor(db)),
      /لا تملك صلاحية/,
    );
    assert.equal(db.homework.length, 0);
  });

  it("13. non-worksheet rejected", async () => {
    const db = createEmptyDb();
    const generationId = seedOwnedWorksheet(db, { kind: "quiz" });
    await assert.rejects(
      () =>
        HomeworkAiImportService.createDraftFromWorksheetGeneration(generationId, authFor(db)),
      /worksheet/,
    );
    assert.equal(db.homework.length, 0);
  });

  it("14. missing generation rejected", async () => {
    const db = createEmptyDb();
    await assert.rejects(
      () =>
        HomeworkAiImportService.createDraftFromWorksheetGeneration(
          "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          authFor(db),
        ),
      /غير موجود/,
    );
  });

  it("15. unauthenticated access rejected", async () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "homework-ai-import.service.ts"),
      "utf8",
    );
    assert.match(source, /resolveUserContext/);
    assert.match(source, /if\s*\(\s*!resolved\s*\)/);
    assert.match(source, /يجب تسجيل الدخول لاستيراد الواجب/);

    // No session-bound caller: foreign teacher cannot import owned generation.
    const db = createEmptyDb();
    seedOwnedWorksheet(db);
    await assert.rejects(
      () =>
        HomeworkAiImportService.createDraftFromWorksheetGeneration(GEN_A, authFor(db, TEACHER_B)),
      /لا تملك صلاحية/,
    );
    assert.equal(db.homework.length, 0);
  });

  it("16. duplicate imports allowed (no provenance column) — creates second draft", async () => {
    const db = createEmptyDb();
    const generationId = seedOwnedWorksheet(db);

    const first = await HomeworkAiImportService.createDraftFromWorksheetGeneration(
      generationId,
      authFor(db),
    );
    const second = await HomeworkAiImportService.createDraftFromWorksheetGeneration(
      generationId,
      authFor(db),
    );

    assert.equal(first.reusedExisting, false);
    assert.equal(second.reusedExisting, false);
    assert.notEqual(first.homework.id, second.homework.id);
    assert.equal(db.homework.length, 2);
    assert.ok(db.homework.every((row) => row.status === "draft"));
  });

  it("17. no client teacher_id — ownership from context only", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serviceSrc = readFileSync(path.join(here, "homework-ai-import.service.ts"), "utf8");
    const logicSrc = readFileSync(path.join(here, "homework-ai-import.logic.ts"), "utf8");

    assert.equal(
      /createDraftFromWorksheetGeneration\([^)]*teacherId|teacher_id\s*:/.test(serviceSrc),
      false,
    );
    assert.equal(/\bteacherId\b|\bteacher_id\b/.test(logicSrc), false);

    // Signature accepts only generationId + optional context
    assert.match(
      serviceSrc,
      /createDraftFromWorksheetGeneration\(\s*generationId:\s*string,\s*context\?:/,
    );
  });

  it("rejects empty generation id", async () => {
    const db = createEmptyDb();
    await assert.rejects(
      () => HomeworkAiImportService.createDraftFromWorksheetGeneration("  ", authFor(db)),
      /معرّف التوليد/,
    );
  });
});
