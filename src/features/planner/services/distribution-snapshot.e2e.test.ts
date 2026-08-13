/**
 * Limited in-memory integration test:
 * Google Sheets fixture → DistributionDraft → Preview → Approval → Snapshot
 * → generateSchedule → planner_entries.
 *
 * No live Supabase. No production plans. No Google writes. No commit.
 */

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { previewDistributionDraftAuthorized } from "./distribution-import.ts";
import {
  DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE,
  loadCurrentDistributionScheduleLessons,
} from "./distribution-schedule-source.ts";
import { simulateApproveDistributionSnapshotRpc } from "./distribution-snapshot.atomic.memory.ts";
import {
  APPROVE_DISTRIBUTION_SNAPSHOT_RPC,
  approveDistributionSnapshotAuthorized,
  type ApproveDistributionSnapshotRpcArgs,
} from "./distribution-snapshot.ts";
import {
  generateSchedule,
  recalculateAndSyncPlanner,
  type CalculatedLessonEntry,
} from "./planner-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");
const SOURCE_FILE = join(ROOT, "src/features/planner/services/distribution-schedule-source.ts");
const SNAPSHOT_SERVICE = join(ROOT, "src/features/planner/services/distribution-snapshot.ts");
const IMPORT_SERVICE = join(ROOT, "src/features/planner/services/distribution-import.ts");
const MIGRATION = join(ROOT, "supabase/migrations/20260813193000_distribution_snapshots.sql");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const CURRICULUM_FILE_ID = "12121212-1212-4121-8121-121212121212";
const YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WESTERN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const PLAN_A = "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PLAN_LEGACY = "99999999-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PLAN_OTHER = "99999999-cccc-4ccc-8ccc-ccccccccccc3";
const PLAN_STALE = "99999999-dddd-4ddd-8ddd-ddddddddddd4";
const PLAN_EMPTY = "99999999-eeee-4eee-8eee-eeeeeeeeeee5";

const VERSION_A = "88888888-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const VERSION_LEGACY = "88888888-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const VERSION_OTHER = "88888888-cccc-4ccc-8ccc-ccccccccccc3";
const VERSION_STALE = "88888888-dddd-4ddd-8ddd-ddddddddddd4";
const VERSION_EMPTY = "88888888-eeee-4eee-8eee-eeeeeeeeeee5";

const SNAPSHOT_OTHER = "77777777-cccc-4ccc-8ccc-ccccccccccc3";
const SNAPSHOT_STALE = "77777777-dddd-4ddd-8ddd-ddddddddddd4";
const SNAPSHOT_EMPTY = "77777777-eeee-4eee-8eee-eeeeeeeeeee5";
const SNAPSHOT_STALE_ON_A = "77777777-aaaa-4aaa-8aaa-aaaaaaaaaaa0";

const PRODUCTION_PLAN_PREFIXES = ["81105a44", "b1637f8b", "10dd9653", "543bc74d", "3e06fbbe"];
const LIVE_YEAR_ID = "01c10273-d41f-4c43-a851-481cfdeddaef";
const LIVE_SEMESTER_ID = "5c772d22-fc94-4059-84e1-b3ff0486e169";

type Row = Record<string, unknown>;
type WriteOp = { table: string; op: "insert" | "update" | "delete"; payload?: unknown };
type Filter =
  | { column: string; op: "eq" | "neq" | "is"; value: unknown }
  | { column: string; op: "in"; value: unknown[] }
  | { column: string; op: "not_eq"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const current = row[filter.column];
    if (filter.op === "eq") return current === filter.value;
    if (filter.op === "neq" || filter.op === "not_eq") return current !== filter.value;
    if (filter.op === "is") return current == null && filter.value == null;
    if (filter.op === "in") return filter.value.includes(current);
    return false;
  });
}

function cloneRows(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row }));
}

function createMemoryDb(seed: Record<string, Row[]>, options: { authUid?: string | null } = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, cloneRows(rows)]),
  );
  const writes: WriteOp[] = [];
  const authUid = options.authUid === undefined ? ADMIN : options.authUid;

  function tableRows(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let limitN: number | null = null;
      let op: "select" | "insert" | "update" | "delete" = "select";
      let payload: unknown;
      let inserted: Row[] | null = null;

      const runSelect = (): Row[] => {
        let rows = tableRows(table).filter((row) => matches(row, filters));
        for (const ord of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[ord.column];
            const bv = b[ord.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (String(av) < String(bv)) return ord.ascending ? -1 : 1;
            return ord.ascending ? 1 : -1;
          });
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return rows.map((row) => ({ ...row }));
      };

      const execute = () => {
        if (op === "insert") {
          if (inserted) return { data: inserted, error: null };
          const rows = Array.isArray(payload) ? payload : [payload];
          inserted = rows.map((row) => {
            const record = { ...(row as Row) };
            if (typeof record.id !== "string" || !record.id) {
              record.id = crypto.randomUUID();
            }
            return record;
          });
          tableRows(table).push(...inserted);
          writes.push({ table, op: "insert", payload: inserted });
          return { data: inserted, error: null };
        }
        if (op === "update") {
          const matched = tableRows(table).filter((row) => matches(row, filters));
          for (const row of matched) Object.assign(row, payload as Row);
          writes.push({ table, op: "update", payload });
          return { data: cloneRows(matched), error: null };
        }
        if (op === "delete") {
          const keep: Row[] = [];
          const removed: Row[] = [];
          for (const row of tableRows(table)) {
            if (matches(row, filters)) removed.push(row);
            else keep.push(row);
          }
          tables[table] = keep;
          writes.push({ table, op: "delete", payload: removed });
          return { data: cloneRows(removed), error: null };
        }
        return { data: runSelect(), error: null };
      };

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert(rows: unknown) {
          op = "insert";
          payload = rows;
          return api;
        },
        update(patch: Row) {
          op = "update";
          payload = patch;
          return api;
        },
        delete() {
          op = "delete";
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push({ column, op: "neq", value });
          return api;
        },
        is(column: string, value: unknown) {
          filters.push({ column, op: "is", value });
          return api;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
          return api;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "eq") filters.push({ column, op: "not_eq", value });
          else filters.push({ column, op: "neq", value });
          return api;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push({ column, ascending: options?.ascending !== false });
          return api;
        },
        limit(n: number) {
          limitN = n;
          return api;
        },
        maybeSingle() {
          const result = execute();
          const rows = Array.isArray(result.data) ? result.data : [];
          return Promise.resolve({ data: rows[0] ?? null, error: result.error });
        },
        single() {
          const result = execute();
          const rows = Array.isArray(result.data) ? result.data : [];
          return Promise.resolve({ data: rows[0] ?? null, error: result.error });
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
    rpc(fn: string, args: ApproveDistributionSnapshotRpcArgs) {
      if (fn !== APPROVE_DISTRIBUTION_SNAPSHOT_RPC) {
        throw new Error(`unexpected rpc ${fn}`);
      }
      writes.push({ table: fn, op: "insert", payload: args });
      return Promise.resolve(
        simulateApproveDistributionSnapshotRpc({
          tables,
          authUid,
          args,
        }),
      );
    },
  };

  return { client, tables, writes };
}

function planRow(id: string, version: number) {
  return {
    id,
    user_id: TEACHER,
    status: "draft",
    subject: "لغتي",
    grade: "أول متوسط",
    academic_year_id: YEAR_ID,
    semester_id: SEMESTER_ID,
    calendar_variant_id: GENERAL_ID,
    current_version: version,
    updated_at: "2026-08-01T00:00:00Z",
  };
}

function versionRow(id: string, planId: string) {
  return {
    id,
    semester_plan_id: planId,
    version_number: 1,
    snapshot: {},
  };
}

function seedTables(): Record<string, Row[]> {
  return {
    user_roles: [{ user_id: ADMIN, role: "admin" }],
    profiles: [
      {
        id: TEACHER,
        grade: "أول متوسط",
        subject: "لغتي",
        classes: null,
      },
    ],
    academic_years: [
      {
        id: YEAR_ID,
        user_id: TEACHER,
        label: "العام الدراسي 1448-1449هـ",
        start_date: "2026-08-23",
        end_date: null,
        is_active: true,
      },
    ],
    semesters: [
      {
        id: SEMESTER_ID,
        user_id: TEACHER,
        academic_year_id: YEAR_ID,
        label: "الفصل الدراسي الأول",
        start_date: "2026-08-30",
        end_date: "2027-01-08",
        order_index: 1,
      },
    ],
    calendar_variants: [
      {
        id: GENERAL_ID,
        code: "GENERAL",
        label: "جميع المناطق",
        is_default: true,
        is_selectable: true,
        sort_order: 0,
      },
      {
        id: WESTERN_ID,
        code: "WESTERN",
        label: "المنطقة الغربية",
        is_default: false,
        is_selectable: true,
        sort_order: 1,
      },
    ],
    calendar_term_overrides: [],
    calendar_exceptions: [
      {
        id: "exc-general-holiday",
        variant_id: GENERAL_ID,
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        kind: "holiday",
        action: "add",
        starts_at: "2026-08-31",
        ends_at: "2026-08-31",
        title: "إجازة تجريبية",
        replaces_exception_id: null,
        is_teaching_day: false,
        is_remote: false,
      },
      {
        id: "exc-western-sunday",
        variant_id: WESTERN_ID,
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        kind: "holiday",
        action: "add",
        starts_at: "2026-08-30",
        ends_at: "2026-08-30",
        title: "إجازة غربية يجب ألا تُستخدم",
        replaces_exception_id: null,
        is_teaching_day: false,
        is_remote: false,
      },
    ],
    teacher_timetable: [
      {
        id: "tt-sun",
        teacher_id: TEACHER,
        day_of_week: 0,
        period: 2,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-mon",
        teacher_id: TEACHER,
        day_of_week: 1,
        period: 2,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-tue-2",
        teacher_id: TEACHER,
        day_of_week: 2,
        period: 2,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-tue-3",
        teacher_id: TEACHER,
        day_of_week: 2,
        period: 3,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        classroom: null,
        starts_at: null,
        ends_at: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "tt-math",
        teacher_id: TEACHER,
        day_of_week: 0,
        period: 7,
        subject: "رياضيات",
        grade: "أول متوسط",
        class_name: "1/ب",
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
        id: CURRICULUM_FILE_ID,
        grade: "أول متوسط",
        subject: "لغتي",
        status: "published",
      },
    ],
    curriculum_lessons: [
      {
        id: LESSON_ID,
        curriculum_file_id: CURRICULUM_FILE_ID,
        title: "درس المنهج المنشور",
        order_index: 1,
        objectives: "هدف المنهج",
        notes: JSON.stringify({ unitName: "وحدة المنهج", periods: "1" }),
      },
    ],
    lesson_sessions: [],
    semester_plans: [
      planRow(PLAN_A, 1),
      planRow(PLAN_LEGACY, 1),
      planRow(PLAN_OTHER, 1),
      planRow(PLAN_STALE, 1),
      planRow(PLAN_EMPTY, 1),
    ],
    semester_plan_versions: [
      versionRow(VERSION_A, PLAN_A),
      versionRow(VERSION_LEGACY, PLAN_LEGACY),
      versionRow(VERSION_OTHER, PLAN_OTHER),
      versionRow(VERSION_STALE, PLAN_STALE),
      versionRow(VERSION_EMPTY, PLAN_EMPTY),
    ],
    distribution_snapshots: [
      {
        id: SNAPSHOT_OTHER,
        semester_plan_id: PLAN_OTHER,
        semester_plan_version_id: VERSION_OTHER,
        spreadsheet_id: "other-sheet",
        worksheet_name: "التوزيع",
        source: "google_sheets",
        item_count: 1,
        total_periods: 1,
        approved_by: ADMIN,
        is_current: true,
      },
      {
        id: SNAPSHOT_STALE_ON_A,
        semester_plan_id: PLAN_A,
        semester_plan_version_id: VERSION_A,
        spreadsheet_id: "stale-sheet",
        worksheet_name: "التوزيع",
        source: "google_sheets",
        item_count: 1,
        total_periods: 1,
        approved_by: ADMIN,
        is_current: true,
      },
      {
        id: SNAPSHOT_STALE,
        semester_plan_id: PLAN_STALE,
        semester_plan_version_id: VERSION_STALE,
        spreadsheet_id: "stale-only",
        worksheet_name: "التوزيع",
        source: "google_sheets",
        item_count: 1,
        total_periods: 1,
        approved_by: ADMIN,
        is_current: false,
      },
      {
        id: SNAPSHOT_EMPTY,
        semester_plan_id: PLAN_EMPTY,
        semester_plan_version_id: VERSION_EMPTY,
        spreadsheet_id: "empty-sheet",
        worksheet_name: "التوزيع",
        source: "google_sheets",
        item_count: 0,
        total_periods: 0,
        approved_by: ADMIN,
        is_current: true,
      },
    ],
    distribution_snapshot_items: [
      {
        id: "item-other",
        snapshot_id: SNAPSHOT_OTHER,
        order_index: 1,
        unit: "وحدة أخرى",
        lesson: "درس خطة أخرى",
        periods: 1,
        notes: "",
        curriculum_lesson_id: null,
      },
      {
        id: "item-stale-a",
        snapshot_id: SNAPSHOT_STALE_ON_A,
        order_index: 1,
        unit: "وحدة قديمة",
        lesson: "درس قديم ملغى",
        periods: 1,
        notes: "",
        curriculum_lesson_id: null,
      },
      {
        id: "item-stale-only",
        snapshot_id: SNAPSHOT_STALE,
        order_index: 1,
        unit: "وحدة غير حالية",
        lesson: "درس لقطة غير حالية",
        periods: 1,
        notes: "",
        curriculum_lesson_id: null,
      },
    ],
    planner_entries: [],
  };
}

function googleEnv() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    GOOGLE_SHEETS_CLIENT_EMAIL: "sa@example.com",
    GOOGLE_SHEETS_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    GOOGLE_SHEET_ID: "sheet-e2e",
  };
}

function sheetRows(): string[][] {
  return [
    ["order", "unit", "lesson", "periods", "notes", "curriculum_lesson_id", "التاريخ", "اليوم"],
    ["1", "الوحدة الأولى", "الدرس الأول", "2", "ملاحظة التوزيع", LESSON_ID, "2026-08-30", "الأحد"],
    ["2", "الوحدة الثانية", "الدرس الثاني", "1", "", "", "2026-09-01", "الثلاثاء"],
  ];
}

function googleFetchSpy(calls: Array<{ method: string; url: string }>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "e2e-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("sheets.googleapis.com")) {
      return new Response(JSON.stringify({ values: sheetRows() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
}

function ctx(userId: string, client: ReturnType<typeof createMemoryDb>["client"]) {
  return { userId, client: client as never };
}

function assertNoProductionIds(tables: Record<string, Row[]>) {
  const blob = JSON.stringify(tables);
  for (const prefix of PRODUCTION_PLAN_PREFIXES) {
    assert.equal(blob.includes(prefix), false, `production plan ${prefix} leaked into fixture db`);
  }
  assert.equal(blob.includes(LIVE_YEAR_ID), false);
  assert.equal(blob.includes(LIVE_SEMESTER_ID), false);
}

function titles(entries: CalculatedLessonEntry[]): string[] {
  return entries.map((entry) => entry.lessonTitle);
}

describe("distribution snapshot end-to-end (in-memory only)", () => {
  it("Sheets → Draft → Preview → Approval → Snapshot → generateSchedule → planner_entries", async () => {
    const memory = createMemoryDb(seedTables());
    const googleCalls: Array<{ method: string; url: string }> = [];
    const curriculumBefore = JSON.stringify(memory.tables.curriculum_lessons);
    const sessionsBefore = JSON.stringify(memory.tables.lesson_sessions);
    const plansBefore = JSON.stringify(memory.tables.semester_plans);

    const draft = await previewDistributionDraftAuthorized(
      memory.client as never,
      ADMIN,
      { worksheetName: "التوزيع", semesterPlanId: PLAN_A },
      { env: googleEnv(), fetchImpl: googleFetchSpy(googleCalls) },
    );

    assert.equal(draft.errors.length, 0);
    assert.equal(draft.summary.errorCount, 0);
    assert.equal(draft.worksheetName, "التوزيع");
    assert.equal(draft.items.length, 2);
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(draft.items[0]?.curriculumMatch, "matched");
    assert.equal(draft.items[1]?.curriculumMatch, "missing_id");
    assert.equal(draft.items[1]?.status, "needs_review");
    assert.equal("hijriDate" in draft.items[0]!, false);
    assert.equal("gregorianDate" in draft.items[0]!, false);
    assert.equal("suggestedDate" in draft.items[0]!, false);

    const approved = await approveDistributionSnapshotAuthorized(
      memory.client as never,
      ADMIN,
      memory.client as never,
      {
        draft,
        semesterPlanId: PLAN_A,
        confirmed: true,
        acknowledgeWarnings: true,
      },
    );
    assert.equal(approved.ok, true);
    if (!approved.ok) throw new Error("approval failed");
    assert.equal(approved.semesterPlanId, PLAN_A);
    assert.equal(approved.semesterPlanVersionId, VERSION_A);
    assert.equal(approved.itemCount, 2);
    assert.equal(approved.totalPeriods, 3);

    const snapshotsForA = memory.tables.distribution_snapshots.filter(
      (row) => row.semester_plan_id === PLAN_A,
    );
    const current = snapshotsForA.filter((row) => row.is_current === true);
    const superseded = snapshotsForA.filter((row) => row.is_current === false);
    assert.equal(current.length, 1);
    assert.equal(superseded.length, 1);
    assert.equal(superseded[0]?.id, SNAPSHOT_STALE_ON_A);
    assert.equal(current[0]?.id, approved.snapshotId);
    assert.equal(current[0]?.semester_plan_version_id, VERSION_A);
    assert.equal("suggested_date" in current[0]!, false);
    assert.equal("hijri_date" in current[0]!, false);
    assert.equal("gregorian_date" in current[0]!, false);

    const items = memory.tables.distribution_snapshot_items
      .filter((row) => row.snapshot_id === approved.snapshotId)
      .sort((a, b) => Number(a.order_index) - Number(b.order_index));
    assert.equal(items.length, 2);
    assert.equal(items[0]?.order_index, 1);
    assert.equal(items[0]?.lesson, "الدرس الأول");
    assert.equal(items[0]?.periods, 2);
    assert.equal(items[0]?.curriculum_lesson_id, LESSON_ID);
    assert.equal(items[1]?.order_index, 2);
    assert.equal(items[1]?.lesson, "الدرس الثاني");
    assert.equal(items[1]?.periods, 1);
    assert.equal(items[1]?.curriculum_lesson_id, null);
    assert.equal("suggested_date" in items[0]!, false);
    assert.equal("date" in items[0]!, false);

    const loaded = await loadCurrentDistributionScheduleLessons(memory.client as never, PLAN_A, 1);
    assert.ok(loaded);
    assert.equal(loaded?.snapshotId, approved.snapshotId);
    assert.equal(loaded?.lessons[0]?.title, "الدرس الأول");
    assert.equal(loaded?.lessons[0]?.id, LESSON_ID);
    assert.equal(loaded?.lessons[1]?.id, null);

    const generated = await generateSchedule(
      "لغتي",
      "أول متوسط",
      PLAN_A,
      ctx(TEACHER, memory.client),
    );

    assert.equal(generated.length >= 3, true);
    assert.equal(generated[0]?.lessonTitle, "الدرس الأول (جزء 1)");
    assert.equal(generated[1]?.lessonTitle, "الدرس الأول (جزء 2)");
    assert.equal(generated[2]?.lessonTitle, "الدرس الثاني");
    assert.equal(generated[0]?.lessonId, LESSON_ID);
    assert.equal(generated[2]?.lessonId, null);
    assert.equal(generated[0]?.unit, "الوحدة الأولى");
    assert.equal(generated[2]?.unit, "الوحدة الثانية");
    assert.equal(generated[0]?.periodsCount, 2);
    assert.equal(generated[0]?.remainingPeriods, 1);
    assert.equal(generated[1]?.remainingPeriods, 0);
    assert.equal(generated[2]?.periodsCount, 1);
    assert.ok(generated.every((entry) => entry.distributionSnapshotId === approved.snapshotId));

    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("درس المنهج المنشور")),
      false,
    );
    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("درس خطة أخرى")),
      false,
    );
    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("درس قديم ملغى")),
      false,
    );

    assert.equal(generated[0]?.suggestedDate, "2026-08-30");
    assert.equal(generated[0]?.dayOfWeek, 0);
    assert.equal(generated[0]?.period, 2);
    assert.equal(generated[0]?.className, "1/أ");
    assert.equal(
      generated.some((entry) => entry.suggestedDate === "2026-08-31"),
      false,
    );
    assert.equal(
      generated.some((entry) => entry.period === 7),
      false,
    );
    assert.equal(
      generated.some((entry) => entry.className === "1/ب"),
      false,
    );
    assert.equal(generated[1]?.suggestedDate, "2026-09-01");
    assert.equal(generated[1]?.period, 2);
    assert.equal(generated[2]?.suggestedDate, "2026-09-01");
    assert.equal(generated[2]?.period, 3);

    const synced = await recalculateAndSyncPlanner(
      "لغتي",
      "أول متوسط",
      { planId: PLAN_A, versionId: VERSION_A, subject: "لغتي" },
      ctx(TEACHER, memory.client),
    );
    assert.deepEqual(titles(synced), titles(generated));

    const stored = memory.tables.planner_entries.filter(
      (row) => row.semester_plan_id === PLAN_A && row.subject !== "OVERRIDES",
    );
    assert.equal(stored.length, generated.length);
    const storedNotes = stored.map((row) => JSON.parse(String(row.notes)) as CalculatedLessonEntry);
    storedNotes.sort((a, b) =>
      a.suggestedDate === b.suggestedDate
        ? a.period - b.period
        : a.suggestedDate.localeCompare(b.suggestedDate),
    );
    assert.equal(storedNotes[0]?.lessonTitle, "الدرس الأول (جزء 1)");
    assert.equal(storedNotes[1]?.lessonTitle, "الدرس الأول (جزء 2)");
    assert.equal(storedNotes[2]?.lessonTitle, "الدرس الثاني");
    assert.equal(storedNotes[0]?.lessonId, LESSON_ID);
    assert.equal(storedNotes[2]?.lessonId, null);

    const sheetGets = googleCalls.filter(
      (call) => call.url.includes("sheets.googleapis.com") && call.method === "GET",
    );
    const sheetWrites = googleCalls.filter(
      (call) =>
        call.url.includes("sheets.googleapis.com") &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(call.method),
    );
    assert.equal(sheetGets.length, 1);
    assert.equal(sheetWrites.length, 0);
    assert.equal(
      googleCalls.some((call) => /values:append|batchUpdate|:batchUpdate/.test(call.url)),
      false,
    );

    assert.equal(JSON.stringify(memory.tables.curriculum_lessons), curriculumBefore);
    assert.equal(JSON.stringify(memory.tables.lesson_sessions), sessionsBefore);
    assert.equal(JSON.stringify(memory.tables.semester_plans), plansBefore);
    assert.equal(
      memory.writes.some((write) => write.table === "curriculum_lessons"),
      false,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "lesson_sessions"),
      false,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "curriculum_files"),
      false,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "academic_years"),
      false,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "calendar_exceptions"),
      false,
    );

    const snapshotsForLegacy = memory.tables.distribution_snapshots.filter(
      (row) => row.semester_plan_id === PLAN_LEGACY,
    );
    assert.equal(snapshotsForLegacy.length, 0);
    assertNoProductionIds(memory.tables);
  });

  it("a plan without a snapshot keeps the published curriculum path", async () => {
    const memory = createMemoryDb(seedTables());
    const generated = await generateSchedule(
      "لغتي",
      "أول متوسط",
      PLAN_LEGACY,
      ctx(TEACHER, memory.client),
    );
    assert.equal(generated[0]?.lessonTitle, "درس المنهج المنشور");
    assert.equal(generated[0]?.lessonId, LESSON_ID);
    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("الدرس الأول")),
      false,
    );
    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("درس خطة أخرى")),
      false,
    );
    assert.equal(
      memory.tables.distribution_snapshots.filter((row) => row.semester_plan_id === PLAN_LEGACY)
        .length,
      0,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "distribution_snapshots"),
      false,
    );
  });

  it("does not use another plan's current snapshot", async () => {
    const memory = createMemoryDb(seedTables());
    const generated = await generateSchedule(
      "لغتي",
      "أول متوسط",
      PLAN_LEGACY,
      ctx(TEACHER, memory.client),
    );
    assert.equal(
      generated.some((entry) => entry.lessonTitle.includes("درس خطة أخرى")),
      false,
    );
    assert.equal(generated[0]?.lessonTitle, "درس المنهج المنشور");
  });

  it("does not use a non-current snapshot", async () => {
    const memory = createMemoryDb(seedTables());
    const loaded = await loadCurrentDistributionScheduleLessons(
      memory.client as never,
      PLAN_STALE,
      1,
    );
    assert.equal(loaded, null);
    await assert.rejects(
      () => generateSchedule("لغتي", "أول متوسط", PLAN_STALE, ctx(TEACHER, memory.client)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
        return true;
      },
    );
    assert.equal(
      memory.writes.some((write) => write.table === "curriculum_lessons"),
      false,
    );
  });

  it("fails closed on an empty current snapshot instead of inventing lessons", async () => {
    const memory = createMemoryDb(seedTables());
    const loaded = await loadCurrentDistributionScheduleLessons(
      memory.client as never,
      PLAN_EMPTY,
      1,
    );
    assert.equal(loaded, null);

    await assert.rejects(
      () => generateSchedule("لغتي", "أول متوسط", PLAN_EMPTY, ctx(TEACHER, memory.client)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
        return true;
      },
    );

    await assert.rejects(
      () => generateSchedule("تجويد", "أول متوسط", PLAN_EMPTY, ctx(TEACHER, memory.client)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
        return true;
      },
    );
    assert.equal(
      memory.writes.some((write) => write.table === "distribution_snapshot_items"),
      false,
    );
    assert.equal(
      memory.writes.some((write) => write.table === "curriculum_lessons"),
      false,
    );
  });

  it("does not backfill snapshots or write Google / curriculum / sessions", () => {
    const engine = readFileSync(ENGINE_FILE, "utf8");
    const source = readFileSync(SOURCE_FILE, "utf8");
    const snapshot = readFileSync(SNAPSHOT_SERVICE, "utf8");
    const importer = readFileSync(IMPORT_SERVICE, "utf8");
    const migration = readFileSync(MIGRATION, "utf8");

    assert.doesNotMatch(engine, /backfill/i);
    assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
    assert.doesNotMatch(
      snapshot,
      /\.from\("planner_entries"\)|\.from\("lesson_sessions"\)|generateSchedule/,
    );
    assert.doesNotMatch(importer, /spreadsheets\.values\.update|values:append|batchUpdate/);
    assert.match(importer, /spreadsheets\.readonly/);
    assert.match(importer, /method: "GET"/);
    assert.doesNotMatch(migration, /INSERT INTO distribution_snapshots/i);
    assert.doesNotMatch(migration, /UPDATE semester_plans/i);
  });
});
