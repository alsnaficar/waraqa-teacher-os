/**
 * P1-C1 snapshot marker and live-read withholding tests.
 * In-memory / SQL-file contracts. No database writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseVersionSnapshot } from "./semester-plan-lifecycle.ts";
import { normalisePlanEntry, type CalculatedLessonEntry } from "./planner-engine.ts";
import {
  decideStoredPlannerEntriesLive,
  nextLiveDateReadAction,
  nextLoadOrGeneratePlanAction,
  resolveStoredPlannerEntriesLive,
} from "./distribution-snapshot-staleness.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SERVICE_FILE = join(ROOT, "src/features/planner/services/semester-plan.service.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");
const LIFECYCLE_FILE = join(ROOT, "src/features/planner/services/semester-plan-lifecycle.ts");
const SESSION_FILE = join(ROOT, "src/features/lesson-sessions/services/lesson-session.service.ts");

const SNAPSHOT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SNAPSHOT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_1 = "11111111-1111-4111-8111-111111111111";
const VERSION_2 = "22222222-2222-4222-8222-222222222222";

function sampleEntry(overrides: Partial<CalculatedLessonEntry> = {}): CalculatedLessonEntry {
  return {
    id: "row-1",
    academicYear: "1447",
    semester: "s1",
    weekNumber: 1,
    teachingWeek: 1,
    suggestedDate: "2026-08-30",
    dayOfWeek: 0,
    period: 1,
    unit: "وحدة",
    lessonId: null,
    lessonTitle: "درس",
    lessonOrder: 1,
    periodsCount: 1,
    remainingPeriods: 0,
    status: "Upcoming",
    className: "1/أ",
    subject: "لغتي",
    objectives: "",
    teachingResources: "",
    assessmentMethods: "",
    planNotes: "",
    distributionSnapshotId: null,
    ...overrides,
  };
}

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => row[filter.column] === filter.value);
}

function createSourceClient(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string }[] = [];
  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      let limitN: number | null = null;
      const runSelect = (): Row[] => {
        let rows = (tables[table] ?? []).filter((row) => matches(row, filters));
        if (limitN != null) rows = rows.slice(0, limitN);
        return rows;
      };
      const execute = async (mode: "many" | "maybe") => {
        const rows = runSelect();
        if (mode === "maybe") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      };
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert() {
          writes.push({ table, op: "insert" });
          throw new Error("must not write");
        },
        update() {
          writes.push({ table, op: "update" });
          throw new Error("must not write");
        },
        delete() {
          writes.push({ table, op: "delete" });
          throw new Error("must not write");
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        order() {
          return api;
        },
        limit(n: number) {
          limitN = n;
          return api;
        },
        maybeSingle() {
          return execute("maybe");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
  return { client, writes };
}

describe("A. normalisePlanEntry marker", () => {
  it("preserves distributionSnapshotId", () => {
    const normalised = normalisePlanEntry(sampleEntry({ distributionSnapshotId: SNAPSHOT_A }));
    assert.equal(normalised?.distributionSnapshotId, SNAPSHOT_A);
  });

  it("missing marker becomes null", () => {
    const raw = sampleEntry();
    delete raw.distributionSnapshotId;
    const normalised = normalisePlanEntry(raw);
    assert.equal(normalised?.distributionSnapshotId, null);
  });
});

describe("B. JSON round-trip", () => {
  it("stringify → parse → normalise preserves marker", () => {
    const original = sampleEntry({ distributionSnapshotId: SNAPSHOT_B });
    const parsed = JSON.parse(JSON.stringify(original)) as Partial<CalculatedLessonEntry>;
    const normalised = normalisePlanEntry(parsed);
    assert.equal(normalised?.distributionSnapshotId, SNAPSHOT_B);
    assert.equal(normalised?.lessonTitle, "درس");
  });
});

describe("D. compare/read helper", () => {
  const stored = [sampleEntry({ distributionSnapshotId: SNAPSHOT_A })];

  it("legacy plan → stored allowed", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(stored, {
        hasDistributionSnapshots: false,
        currentSnapshotId: null,
      }),
      "allow",
    );
    assert.equal(
      decideStoredPlannerEntriesLive([sampleEntry({ distributionSnapshotId: null })], {
        hasDistributionSnapshots: false,
        currentSnapshotId: null,
      }),
      "allow",
    );
  });

  it("current snapshot + matching marker → stored allowed", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(stored, {
        hasDistributionSnapshots: true,
        currentSnapshotId: SNAPSHOT_A,
      }),
      "allow",
    );
  });

  it("current snapshot + stale marker → withheld", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(stored, {
        hasDistributionSnapshots: true,
        currentSnapshotId: SNAPSHOT_B,
      }),
      "withhold",
    );
  });

  it("current snapshot + missing marker → withheld", () => {
    assert.equal(
      decideStoredPlannerEntriesLive([sampleEntry({ distributionSnapshotId: null })], {
        hasDistributionSnapshots: true,
        currentSnapshotId: SNAPSHOT_A,
      }),
      "withhold",
    );
    assert.equal(
      decideStoredPlannerEntriesLive([sampleEntry()], {
        hasDistributionSnapshots: true,
        currentSnapshotId: SNAPSHOT_A,
      }),
      "withhold",
    );
  });

  it("mixed markers → withheld", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(
        [
          sampleEntry({ distributionSnapshotId: SNAPSHOT_A }),
          sampleEntry({ id: "row-2", distributionSnapshotId: SNAPSHOT_B }),
        ],
        { hasDistributionSnapshots: true, currentSnapshotId: SNAPSHOT_A },
      ),
      "withhold",
    );
  });

  it("distribution plan + no current snapshot → fail-closed", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(stored, {
        hasDistributionSnapshots: true,
        currentSnapshotId: null,
      }),
      "fail-closed",
    );
  });

  it("V2 with old V1 entries and no V2 snapshot → fail-closed", () => {
    assert.equal(
      decideStoredPlannerEntriesLive(stored, {
        hasDistributionSnapshots: true,
        currentSnapshotId: null,
      }),
      "fail-closed",
    );
  });
});

describe("E. loadOrGeneratePlan action", () => {
  it("matching stored entries returned", () => {
    assert.equal(nextLoadOrGeneratePlanAction("allow", 3), "return-stored");
  });

  it("stale stored entries NOT returned and do not generate", () => {
    assert.equal(nextLoadOrGeneratePlanAction("withhold", 3), "return-empty");
  });

  it("missing-marker entries NOT returned", () => {
    assert.equal(nextLoadOrGeneratePlanAction("withhold", 1), "return-empty");
  });

  it("V2 inherited entries NOT returned", () => {
    assert.equal(nextLoadOrGeneratePlanAction("fail-closed", 8), "fail-closed");
  });

  it("no stale path continues to generate", () => {
    assert.notEqual(nextLoadOrGeneratePlanAction("withhold", 4), "continue-generate");
    assert.notEqual(nextLoadOrGeneratePlanAction("fail-closed", 4), "continue-generate");
    assert.equal(nextLoadOrGeneratePlanAction("allow", 0), "continue-generate");
  });
});

describe("F. date/live read", () => {
  it("withhold and fail-closed do not return stored entries", () => {
    assert.equal(nextLiveDateReadAction("allow"), "return-stored");
    assert.equal(nextLiveDateReadAction("withhold"), "return-empty");
    assert.equal(nextLiveDateReadAction("fail-closed"), "return-empty");
  });

  it("live service paths use the staleness helper and do not rewrite sessions", () => {
    const service = readFileSync(SERVICE_FILE, "utf8");
    assert.match(service, /resolveStoredPlannerEntriesLive/);
    assert.match(service, /nextLoadOrGeneratePlanAction/);
    assert.match(service, /nextLiveDateReadAction/);
    assert.match(service, /loadCanonicalSemesterPlan/);
    assert.match(service, /getPlanEntriesForDate/);
    assert.match(service, /loadLinkedEntriesAcrossPlansForDate/);
    const session = readFileSync(SESSION_FILE, "utf8");
    assert.match(session, /getPlanEntriesForDate/);
    assert.match(session, /ignoreDuplicates: true/);
    assert.doesNotMatch(session, /distributionSnapshotId/);
  });
});

describe("G. historical snapshots", () => {
  it("old version JSON without distributionSnapshotId still parses", () => {
    const parsed = parseVersionSnapshot({
      capturedAt: "2026-08-13T00:00:00.000Z",
      entries: [
        {
          id: "hist-1",
          suggestedDate: "2026-08-30",
          period: 1,
          lessonTitle: "درس قديم",
          dayOfWeek: 0,
        },
      ],
      overrides: [],
    });
    assert.equal(parsed.entries?.length, 1);
    assert.equal(parsed.entries?.[0]?.lessonTitle, "درس قديم");
    assert.equal(parsed.entries?.[0]?.distributionSnapshotId, null);
  });

  it("historical loader does not call live snapshot validation", () => {
    const lifecycle = readFileSync(LIFECYCLE_FILE, "utf8");
    assert.match(lifecycle, /loadHistoricalVersionEntries/);
    assert.doesNotMatch(lifecycle, /resolveStoredPlannerEntriesLive/);
    assert.doesNotMatch(lifecycle, /decideStoredPlannerEntriesLive/);
  });
});

describe("resolveStoredPlannerEntriesLive (no writes)", () => {
  it("allows matching current snapshot rows", async () => {
    const { client, writes } = createSourceClient({
      semester_plan_versions: [{ id: VERSION_1, semester_plan_id: PLAN_ID, version_number: 1 }],
      distribution_snapshots: [
        {
          id: SNAPSHOT_A,
          semester_plan_id: PLAN_ID,
          semester_plan_version_id: VERSION_1,
          is_current: true,
        },
      ],
      distribution_snapshot_items: [
        {
          snapshot_id: SNAPSHOT_A,
          order_index: 1,
          unit: "و",
          lesson: "درس",
          periods: 1,
          notes: "",
          curriculum_lesson_id: null,
        },
      ],
    });
    const result = await resolveStoredPlannerEntriesLive(client as never, PLAN_ID, 1, [
      sampleEntry({ distributionSnapshotId: SNAPSHOT_A }),
    ]);
    assert.equal(result.kind, "allow");
    assert.equal(writes.length, 0);
  });

  it("fail-closes V2 when only V1 has a snapshot", async () => {
    const { client, writes } = createSourceClient({
      semester_plan_versions: [
        { id: VERSION_1, semester_plan_id: PLAN_ID, version_number: 1 },
        { id: VERSION_2, semester_plan_id: PLAN_ID, version_number: 2 },
      ],
      distribution_snapshots: [
        {
          id: SNAPSHOT_A,
          semester_plan_id: PLAN_ID,
          semester_plan_version_id: VERSION_1,
          is_current: true,
        },
      ],
      distribution_snapshot_items: [
        {
          snapshot_id: SNAPSHOT_A,
          order_index: 1,
          unit: "و",
          lesson: "درس",
          periods: 1,
          notes: "",
          curriculum_lesson_id: null,
        },
      ],
    });
    const result = await resolveStoredPlannerEntriesLive(client as never, PLAN_ID, 2, [
      sampleEntry({ distributionSnapshotId: SNAPSHOT_A }),
    ]);
    assert.equal(result.kind, "fail-closed");
    assert.equal(writes.length, 0);
  });
});

describe("H. regression contracts", () => {
  it("does not auto-regenerate, delete, or rewrite planner_entries on stale read", () => {
    const service = readFileSync(SERVICE_FILE, "utf8");
    assert.match(service, /applyLiveStoredPlannerEntries/);
    const failIdx = service.indexOf('action === "fail-closed"');
    const withholdIdx = service.indexOf('action === "return-empty"');
    const generateIdx = service.indexOf("await generateSchedule");
    const syncIdx = service.indexOf("await syncScheduleToDatabase");
    assert.ok(failIdx > 0 && withholdIdx > failIdx);
    assert.ok(generateIdx > withholdIdx);
    assert.ok(syncIdx > generateIdx);
    assert.match(service, /throw new Error\(DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE\)/);
    const engine = readFileSync(ENGINE_FILE, "utf8");
    assert.match(engine, /distributionSnapshotId\?: string \| null/);
    assert.doesNotMatch(engine, /create_semester_plan_version/);
  });
});
