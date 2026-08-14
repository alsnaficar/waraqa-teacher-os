import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DISTRIBUTION_CAPACITY_CALENDAR_FAILED_NOTE,
  DISTRIBUTION_CAPACITY_DEFICIT_NOTE,
  DISTRIBUTION_CAPACITY_FIT_NOTE,
  DISTRIBUTION_CAPACITY_NO_PLAN_NOTE,
  DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE,
  DISTRIBUTION_CAPACITY_SURPLUS_NOTE,
  applyCurriculumMatches,
  parseDistributionSheet,
  unknownDistributionCapacity,
} from "./distribution-import.logic.ts";
import {
  compareDistributionCapacity,
  resolveDistributionDemand,
} from "./distribution-capacity.logic.ts";
import {
  attachDistributionCapacity,
  computeDistributionCapacityForPlan,
} from "./distribution-capacity.ts";
import { decideDistributionSnapshotApproval } from "./distribution-snapshot.logic.ts";
import {
  buildPlanTeachingSlots,
  buildTeachingDates,
  countWeeklyMatchingTimetableSlots,
  type AcademicCalendarConfig,
  type TimetableSlot,
} from "./planner-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CAPACITY_FILE = join(ROOT, "src/features/planner/services/distribution-capacity.ts");
const LOGIC_FILE = join(ROOT, "src/features/planner/services/distribution-capacity.logic.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");
const FUNCTIONS_FILE = join(ROOT, "src/features/planner/distribution-import.functions.ts");
const PANEL_FILE = join(ROOT, "src/features/planner/components/distribution-import-panel.tsx");

const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PEER_TEACHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_ID = "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const YEAR_ID = "01c10273-1111-4111-8111-111111111111";
const SEMESTER_ID = "5c772d22-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Row = Record<string, unknown>;
type Filter =
  | { column: string; op: "eq" | "is"; value: unknown }
  | { column: string; op: "in"; value: unknown[] };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const current = row[filter.column];
    if (filter.op === "eq") return current === filter.value;
    if (filter.op === "is") return current == null && filter.value == null;
    if (filter.op === "in") return filter.value.includes(current);
    return false;
  });
}

function applyReadPolicies(
  table: string,
  rows: Row[],
  auth?: { userId: string; isAdmin?: boolean },
): Row[] {
  if (!auth) return rows;
  if (table === "teacher_timetable") {
    return rows.filter((row) => auth.isAdmin || row.teacher_id === auth.userId);
  }
  if (table === "profiles") {
    return rows.filter((row) => row.id === auth.userId);
  }
  return rows;
}

function createMemoryDb(seed: Record<string, Row[]>, auth?: { userId: string; isAdmin?: boolean }) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const writes: Array<{ table: string; op: string }> = [];
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: string[] = [];
      let limitN: number | null = null;
      const runSelect = () => {
        let rows = applyReadPolicies(
          table,
          (tables[table] ?? []).filter((row) => matches(row, filters)),
          auth,
        );
        for (const column of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return rows;
      };
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert() {
          writes.push({ table, op: "insert" });
          return api;
        },
        update() {
          writes.push({ table, op: "update" });
          return api;
        },
        delete() {
          writes.push({ table, op: "delete" });
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
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
        order(column: string) {
          orders.push(column);
          return api;
        },
        limit(n: number) {
          limitN = n;
          return api;
        },
        maybeSingle() {
          const rows = runSelect();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          const rows = runSelect();
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: runSelect(), error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  return { client, writes, tables };
}

function shortConfig(): AcademicCalendarConfig {
  return {
    academicYear: "1448-1449",
    semesterId: SEMESTER_ID,
    semesterStart: "2026-08-30",
    semesterEnd: "2026-09-07",
    teachingWeeksCount: 15,
    periodsPerDay: 7,
    workingDays: [0, 1, 2, 3, 4],
    holidays: [{ date: "2026-09-01", label: "إجازة" }],
    examWeeks: [],
  };
}

const DEMAND_ITEMS = [{ periods: 2 }, { periods: 1 }];
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

function weeklyTimetable(): TimetableSlot[] {
  return [
    { dayOfWeek: 0, period: 2, className: "1/أ", subject: "لغتي", grade: "أول متوسط" },
    { dayOfWeek: 1, period: 2, className: "1/أ", subject: "لغتي", grade: "أول متوسط" },
    { dayOfWeek: 0, period: 7, className: "1/ب", subject: "رياضيات", grade: "أول متوسط" },
  ];
}

function capacitySeed(options?: { timetable?: Row[] }): Record<string, Row[]> {
  return {
    semester_plans: [
      {
        id: PLAN_ID,
        status: "draft",
        user_id: TEACHER,
        subject: "لغتي",
        grade: "أول متوسط",
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        calendar_variant_id: GENERAL_ID,
      },
    ],
    academic_years: [
      {
        id: YEAR_ID,
        label: "العام الدراسي 1448-1449هـ",
        start_date: "2026-08-23",
        end_date: null,
        is_active: true,
      },
    ],
    semesters: [
      {
        id: SEMESTER_ID,
        academic_year_id: YEAR_ID,
        label: "الفصل الدراسي الأول",
        start_date: "2026-08-30",
        end_date: "2026-09-07",
        order_index: 1,
      },
    ],
    calendar_variants: [
      { id: GENERAL_ID, code: "GENERAL", label: "جميع المناطق", is_selectable: true },
    ],
    calendar_term_overrides: [],
    calendar_exceptions: [
      {
        id: "exc-1",
        variant_id: GENERAL_ID,
        academic_year_id: YEAR_ID,
        semester_id: SEMESTER_ID,
        kind: "holiday",
        action: "add",
        starts_at: "2026-09-01",
        ends_at: "2026-09-01",
        title: "إجازة",
        replaces_exception_id: null,
        is_teaching_day: false,
        is_remote: false,
      },
    ],
    teacher_timetable: options?.timetable ?? [
      {
        id: "tt-1",
        teacher_id: TEACHER,
        day_of_week: 0,
        period: 2,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        active: true,
      },
      {
        id: "tt-2",
        teacher_id: TEACHER,
        day_of_week: 1,
        period: 2,
        subject: "لغتي",
        grade: "أول متوسط",
        class_name: "1/أ",
        active: true,
      },
      {
        id: "tt-math",
        teacher_id: TEACHER,
        day_of_week: 0,
        period: 7,
        subject: "رياضيات",
        grade: "أول متوسط",
        class_name: "1/ب",
        active: true,
      },
    ],
    profiles: [{ id: TEACHER, classes: null }],
  };
}

describe("compareDistributionCapacity", () => {
  it("reports fit, surplus, and deficit without inventing slots", () => {
    const fit = compareDistributionCapacity(10, 10);
    assert.equal(fit.status, "known");
    assert.equal(fit.comparison, "fit");
    assert.equal(fit.delta, 0);
    assert.equal(fit.note, DISTRIBUTION_CAPACITY_FIT_NOTE);

    const surplus = compareDistributionCapacity(8, 10, {
      weeklyMatchingSlots: 2,
      teachingDayCount: 4,
    });
    assert.equal(surplus.comparison, "surplus");
    assert.equal(surplus.delta, 2);
    assert.equal(surplus.weeklyMatchingSlots, 2);
    assert.equal(surplus.note, DISTRIBUTION_CAPACITY_SURPLUS_NOTE);

    const deficit = compareDistributionCapacity(12, 10);
    assert.equal(deficit.comparison, "deficit");
    assert.equal(deficit.delta, -2);
    assert.equal(deficit.note, DISTRIBUTION_CAPACITY_DEFICIT_NOTE);
  });

  it("keeps unknown capacity empty", () => {
    const unknown = unknownDistributionCapacity(3);
    assert.equal(unknown.availableSlots, null);
    assert.equal(unknown.delta, null);
    assert.equal(unknown.comparison, null);
  });
});

describe("resolveDistributionDemand", () => {
  it("ignores a spoofed client totalPeriods of 999 when items sum to 3", () => {
    assert.equal(resolveDistributionDemand(DEMAND_ITEMS, 999), 3);
  });

  it("ignores a spoofed client totalPeriods of 0 when items sum to 3", () => {
    assert.equal(resolveDistributionDemand(DEMAND_ITEMS, 0), 3);
  });

  it("uses the same periods>=1 rule as snapshot approval", () => {
    const items = [
      { periods: 2 },
      { periods: 1 },
      { periods: null },
      { periods: 0 },
      { periods: -4 },
    ];
    assert.equal(resolveDistributionDemand(items, 50), 3);
  });
});

describe("buildPlanTeachingSlots", () => {
  it("uses weekly subject slots, not every school period, and skips holidays", () => {
    const timetable = weeklyTimetable();
    const dates = buildTeachingDates(shortConfig());
    const slots = buildPlanTeachingSlots(dates, timetable, "لغتي", "أول متوسط");

    assert.equal(countWeeklyMatchingTimetableSlots(timetable, "لغتي", "أول متوسط"), 2);
    assert.equal(
      slots.some((slot) => slot.date === "2026-09-01"),
      false,
    );
    assert.equal(
      slots.some((slot) => slot.period === 7),
      false,
    );
    assert.equal(slots[0]?.date, "2026-08-30");
    assert.equal(slots[0]?.period, 2);
    assert.equal(slots[1]?.date, "2026-08-31");
    assert.equal(slots[1]?.period, 2);
    assert.equal(slots.length, 4);
  });
});

describe("computeDistributionCapacityForPlan", () => {
  it("compares demand against calendar + owner timetable without writes", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });

    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
    );

    assert.equal(capacity.status, "known");
    assert.equal(capacity.availableSlots, 4);
    assert.equal(capacity.totalPeriods, 3);
    assert.equal(capacity.delta, 1);
    assert.equal(capacity.comparison, "surplus");
    assert.equal(capacity.weeklyMatchingSlots, 2);
    assert.equal(capacity.teachingDayCount, 6);
    assert.equal(memory.writes.length, 0);
  });

  it("uses item periods as X even when the client sends totalPeriods 999", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });
    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
      999,
    );
    assert.equal(capacity.totalPeriods, 3);
    assert.equal(capacity.availableSlots, 4);
    assert.equal(capacity.delta, 1);
    assert.equal(capacity.comparison, "surplus");
    assert.equal(memory.writes.length, 0);
  });

  it("uses item periods as X even when the client sends totalPeriods 0", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });
    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
      0,
    );
    assert.equal(capacity.totalPeriods, 3);
    assert.equal(capacity.availableSlots, 4);
    assert.equal(capacity.delta, 1);
    assert.equal(memory.writes.length, 0);
  });

  it("matches snapshot demand for a valid draft", async () => {
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس أ", "2", LESSON_ID],
        ["2", "وحدة", "درس ب", "1", LESSON_ID],
      ],
      { spreadsheetId: "sheet-abc", worksheetName: "التوزيع" },
    );
    const draft = applyCurriculumMatches(parsed, [{ id: LESSON_ID, title: "درس أ" }]);
    const decision = decideDistributionSnapshotApproval({
      draft,
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(resolveDistributionDemand(draft.items, 999), 3);
    assert.equal(decision.totalPeriods, 3);
    assert.equal(resolveDistributionDemand(draft.items), decision.totalPeriods);

    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });
    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      draft.items,
      999,
    );
    assert.equal(capacity.totalPeriods, decision.totalPeriods);
    assert.equal(memory.writes.length, 0);
  });

  it("keeps duplicate/error demand on the same periods>=1 rule as approval", async () => {
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس أ", "2", LESSON_ID],
        ["1", "وحدة", "درس مكرر", "2", LESSON_ID],
        ["2", "وحدة", "درس ب", "1", LESSON_ID],
      ],
      { spreadsheetId: "sheet-abc", worksheetName: "التوزيع" },
    );
    const draft = applyCurriculumMatches(parsed, [{ id: LESSON_ID, title: "درس أ" }]);
    const decision = decideDistributionSnapshotApproval({
      draft,
      semesterPlanId: PLAN_ID,
      planStatus: "draft",
      confirmed: true,
      acknowledgeWarnings: false,
    });
    assert.equal(decision.ok, false);
    assert.equal(resolveDistributionDemand(draft.items, 999), 5);
    assert.equal(draft.items.filter((item) => item.status === "error").length > 0, true);
  });

  it("does not invent plan context and stays unknown without a readable plan", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods"],
        ["1", "وحدة", "درس أ", "2"],
        ["2", "وحدة", "درس ب", "1"],
      ],
      { spreadsheetId: "sheet-abc", worksheetName: "التوزيع" },
    );
    parsed.context = {
      academicYearId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      semesterId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      gradeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      subjectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      semesterPlanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      available: true,
      note: null,
    };
    parsed.summary.totalPeriods = 999;
    const attached = await attachDistributionCapacity(
      parsed,
      {
        userId: TEACHER,
        client: memory.client as never,
      },
      "00000000-0000-4000-8000-000000000000",
    );
    assert.equal(attached.capacity.status, "unknown");
    assert.equal(attached.capacity.note, DISTRIBUTION_CAPACITY_NO_PLAN_NOTE);
    assert.equal(attached.capacity.totalPeriods, 3);
    assert.equal(attached.context.academicYearId, null);
    assert.equal(attached.context.semesterId, null);
    assert.equal(attached.context.gradeId, null);
    assert.equal(attached.context.subjectId, null);
    assert.equal(memory.writes.length, 0);
  });

  it("reads plan context from the database when the plan is readable", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: TEACHER });
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods"],
        ["1", "وحدة", "درس أ", "2"],
        ["2", "وحدة", "درس ب", "1"],
      ],
      { spreadsheetId: "sheet-abc", worksheetName: "التوزيع" },
    );
    parsed.context = {
      academicYearId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      semesterId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      gradeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      subjectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      semesterPlanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      available: true,
      note: null,
    };
    const attached = await attachDistributionCapacity(
      parsed,
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
    );
    assert.equal(attached.capacity.status, "known");
    assert.equal(attached.context.academicYearId, YEAR_ID);
    assert.equal(attached.context.semesterId, SEMESTER_ID);
    assert.equal(attached.context.semesterPlanId, PLAN_ID);
    assert.equal(attached.context.gradeId, null);
    assert.equal(attached.context.subjectId, null);
    assert.equal(memory.writes.length, 0);
  });

  it("keeps capacity unknown when the official calendar cannot be resolved", async () => {
    const seed = capacitySeed();
    seed.academic_years = [];
    seed.semesters = [];
    const memory = createMemoryDb(seed, { userId: TEACHER });
    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
      999,
    );
    assert.equal(capacity.status, "unknown");
    assert.equal(capacity.availableSlots, null);
    assert.equal(capacity.totalPeriods, 3);
    assert.equal(capacity.note, DISTRIBUTION_CAPACITY_CALENDAR_FAILED_NOTE);
    assert.equal(memory.writes.length, 0);
  });

  it("lets an admin read another teacher's timetable as known capacity", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: ADMIN, isAdmin: true });

    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: ADMIN, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
    );

    assert.equal(capacity.status, "known");
    assert.equal(capacity.availableSlots, 4);
    assert.equal(capacity.totalPeriods, 3);
    assert.equal(capacity.delta, 1);
    assert.equal(capacity.comparison, "surplus");
    assert.equal(capacity.weeklyMatchingSlots, 2);
    assert.equal(capacity.teachingDayCount, 6);
    assert.equal(memory.writes.length, 0);
  });

  it("does not let a peer teacher read the plan owner's timetable", async () => {
    const memory = createMemoryDb(capacitySeed(), { userId: PEER_TEACHER });

    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: PEER_TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
    );

    assert.equal(capacity.status, "unknown");
    assert.equal(capacity.availableSlots, null);
    assert.equal(capacity.note, DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE);
    assert.equal(memory.writes.length, 0);
  });

  it("does not treat DEFAULT_TIMETABLE as known capacity", async () => {
    const memory = createMemoryDb(capacitySeed({ timetable: [] }), { userId: TEACHER });

    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: TEACHER, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
    );
    assert.equal(capacity.status, "unknown");
    assert.equal(capacity.availableSlots, null);
    assert.equal(capacity.note, DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE);
    assert.equal(memory.writes.length, 0);
  });

  it("keeps admin capacity unknown when the owner has no timetable", async () => {
    const memory = createMemoryDb(capacitySeed({ timetable: [] }), {
      userId: ADMIN,
      isAdmin: true,
    });

    const { capacity } = await computeDistributionCapacityForPlan(
      { userId: ADMIN, client: memory.client as never },
      PLAN_ID,
      DEMAND_ITEMS,
    );
    assert.equal(capacity.status, "unknown");
    assert.equal(capacity.availableSlots, null);
    assert.equal(capacity.note, DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE);
    assert.equal(memory.writes.length, 0);
  });
});

describe("capacity preview contracts", () => {
  it("does not generate or sync a plan", () => {
    const capacity = readFileSync(CAPACITY_FILE, "utf8");
    const logic = readFileSync(LOGIC_FILE, "utf8");
    const engine = readFileSync(ENGINE_FILE, "utf8");
    const functions = readFileSync(FUNCTIONS_FILE, "utf8");
    const panel = readFileSync(PANEL_FILE, "utf8");

    assert.doesNotMatch(capacity, /generateSchedule\(/);
    assert.doesNotMatch(capacity, /syncScheduleToDatabase/);
    assert.doesNotMatch(capacity, /recalculateAndSyncPlanner/);
    assert.doesNotMatch(capacity, /DEFAULT_TIMETABLE/);
    assert.doesNotMatch(capacity, /service_role/);
    assert.doesNotMatch(capacity, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
    assert.doesNotMatch(logic, /generateSchedule/);
    assert.match(engine, /buildPlanTeachingSlots\(/);
    assert.match(functions, /previewDistributionCapacity/);
    assert.match(functions, /items:\s*z/);
    assert.doesNotMatch(functions, /CapacityInput[\s\S]{0,280}totalPeriods/);
    assert.doesNotMatch(functions, /generateSchedule/);
    assert.match(panel, /previewDistributionCapacity/);
    assert.match(panel, /items/);
    assert.doesNotMatch(panel, /totalPeriods:\s*demand/);
    assert.doesNotMatch(panel, /generateSchedule/);
    assert.doesNotMatch(panel, /WESTERN/);
  });
});
