import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE,
  loadCurrentDistributionScheduleLessons,
  mapSnapshotItemsToScheduleLessons,
  planHasDistributionSnapshots,
  resolveDistributionScheduleLessons,
} from "./distribution-schedule-source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SOURCE_FILE = join(ROOT, "src/features/planner/services/distribution-schedule-source.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");

const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_PLAN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERSION_1_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_2_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_A_ID = "77777777-7777-4777-8777-777777777777";
const SNAPSHOT_B_ID = "66666666-6666-4666-8666-666666666666";
const LESSON_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq"; value: unknown };

function snapshotItems(overrides: Partial<Row> = {}): Row[] {
  return [
    {
      snapshot_id: SNAPSHOT_A_ID,
      order_index: 2,
      unit: "الوحدة الثانية",
      lesson: "الدرس الثاني",
      periods: 1,
      notes: "",
      curriculum_lesson_id: null,
      ...overrides,
    },
    {
      snapshot_id: SNAPSHOT_A_ID,
      order_index: 1,
      unit: "الوحدة الأولى",
      lesson: "الدرس الأول",
      periods: 2,
      notes: "ملاحظة",
      curriculum_lesson_id: LESSON_ID,
    },
  ];
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => row[filter.column] === filter.value);
}

function createSourceClient(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const writes: { table: string; op: string }[] = [];

  const client = {
    from(table: string) {
      reads.push(table);
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let limitN: number | null = null;

      const runSelect = (): Row[] => {
        let rows = (tables[table] ?? []).filter((row) => matches(row, filters));
        for (const ord of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[ord.column];
            const bv = b[ord.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return ord.ascending ? -1 : 1;
            return av < bv ? (ord.ascending ? -1 : 1) : ord.ascending ? 1 : -1;
          });
        }
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
          throw new Error("must not insert from distribution schedule source");
        },
        update() {
          writes.push({ table, op: "update" });
          throw new Error("must not update from distribution schedule source");
        },
        upsert() {
          writes.push({ table, op: "upsert" });
          throw new Error("must not upsert from distribution schedule source");
        },
        delete() {
          writes.push({ table, op: "delete" });
          throw new Error("must not delete from distribution schedule source");
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
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
          return execute("maybe");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };

      return api;
    },
  };

  return { client, reads, writes };
}

function legacyTables(): Record<string, Row[]> {
  return {
    semester_plan_versions: [
      {
        id: VERSION_1_ID,
        semester_plan_id: PLAN_ID,
        version_number: 1,
      },
    ],
    distribution_snapshots: [],
    distribution_snapshot_items: [],
  };
}

function currentSnapshotTables(options?: {
  currentVersion?: number;
  snapshotVersionId?: string;
  isCurrent?: boolean;
  items?: Row[];
  extraSnapshots?: Row[];
}): Record<string, Row[]> {
  const currentVersion = options?.currentVersion ?? 1;
  const snapshotVersionId = options?.snapshotVersionId ?? VERSION_1_ID;
  const isCurrent = options?.isCurrent ?? true;
  return {
    semester_plan_versions: [
      {
        id: VERSION_1_ID,
        semester_plan_id: PLAN_ID,
        version_number: 1,
      },
      {
        id: VERSION_2_ID,
        semester_plan_id: PLAN_ID,
        version_number: 2,
      },
    ],
    distribution_snapshots: [
      {
        id: SNAPSHOT_A_ID,
        semester_plan_id: PLAN_ID,
        semester_plan_version_id: snapshotVersionId,
        is_current: isCurrent,
      },
      ...(options?.extraSnapshots ?? []),
    ],
    distribution_snapshot_items: options?.items ?? snapshotItems(),
  };
}

function assertFailClosed(error: unknown) {
  assert.ok(error instanceof Error);
  assert.equal(error.message, DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
  assert.equal(error.message.includes("1447"), false);
  return true;
}

describe("mapSnapshotItemsToScheduleLessons", () => {
  it("orders snapshot items and preserves periods and curriculum ids", () => {
    const lessons = mapSnapshotItemsToScheduleLessons(snapshotItems() as never);
    assert.equal(lessons.length, 2);
    assert.equal(lessons[0]?.title, "الدرس الأول");
    assert.equal(lessons[0]?.orderIndex, 1);
    assert.equal(lessons[0]?.periodsCount, 2);
    assert.equal(lessons[0]?.id, LESSON_ID);
    assert.equal(lessons[0]?.planNotes, "ملاحظة");
    assert.equal(lessons[1]?.title, "الدرس الثاني");
    assert.equal(lessons[1]?.id, null);
    assert.equal("suggestedDate" in lessons[0]!, false);
    assert.equal("dayOfWeek" in lessons[0]!, false);
  });

  it("drops invalid snapshot rows instead of inventing curriculum lessons", () => {
    const lessons = mapSnapshotItemsToScheduleLessons([
      {
        order_index: 1,
        unit: "",
        lesson: "   ",
        periods: 2,
        notes: "",
        curriculum_lesson_id: null,
      },
      {
        order_index: 2,
        unit: "وحدة",
        lesson: "صالح",
        periods: 0,
        notes: "",
        curriculum_lesson_id: null,
      },
      {
        order_index: 3,
        unit: "وحدة",
        lesson: "درس صالح",
        periods: 1,
        notes: "",
        curriculum_lesson_id: null,
      },
    ]);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0]?.title, "درس صالح");
  });
});

describe("loadCurrentDistributionScheduleLessons", () => {
  it("returns mapped items for the current plan version snapshot", async () => {
    const { client } = createSourceClient(currentSnapshotTables());
    const current = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(current?.snapshotId, SNAPSHOT_A_ID);
    assert.equal(current?.lessons.length, 2);
    assert.equal(current?.lessons[0]?.title, "الدرس الأول");
    assert.equal(current?.lessons[0]?.periodsCount, 2);
  });

  it("returns null when the current version has no snapshot", async () => {
    const { client } = createSourceClient(legacyTables());
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("does not select a snapshot that belongs to another version", async () => {
    const { client } = createSourceClient(
      currentSnapshotTables({ currentVersion: 2, snapshotVersionId: VERSION_1_ID }),
    );
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 2);
    assert.equal(lessons, null);
  });

  it("does not select a snapshot with is_current=false", async () => {
    const { client } = createSourceClient(currentSnapshotTables({ isCurrent: false }));
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("returns null for an empty snapshot instead of synthesizing curriculum rows", async () => {
    const { client } = createSourceClient(currentSnapshotTables({ items: [] }));
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("never writes snapshot or curriculum rows", async () => {
    const { client, writes, reads } = createSourceClient(currentSnapshotTables());
    await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(writes.length, 0);
    assert.equal(reads.includes("curriculum_lessons"), false);
    assert.ok(reads.includes("distribution_snapshots"));
    assert.ok(reads.includes("distribution_snapshot_items"));
  });
});

describe("resolveDistributionScheduleLessons", () => {
  it("legacy plan with no historical snapshot returns null for curriculum fallback", async () => {
    const { client, reads } = createSourceClient(legacyTables());
    const lessons = await resolveDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
    assert.equal(await planHasDistributionSnapshots(client as never, PLAN_ID), false);
    assert.equal(reads.includes("curriculum_lessons"), false);
  });

  it("uses the current snapshot when it is valid", async () => {
    const { client } = createSourceClient(currentSnapshotTables());
    const current = await resolveDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(current?.snapshotId, SNAPSHOT_A_ID);
    assert.equal(current?.lessons.length, 2);
    assert.equal(current?.lessons[0]?.title, "الدرس الأول");
  });

  it("fails closed when a distribution plan has no snapshot on the current version", async () => {
    const { client, reads } = createSourceClient(
      currentSnapshotTables({ snapshotVersionId: VERSION_1_ID }),
    );
    await assert.rejects(
      () => resolveDistributionScheduleLessons(client as never, PLAN_ID, 2),
      assertFailClosed,
    );
    assert.equal(reads.includes("curriculum_lessons"), false);
  });

  it("fails closed when the only snapshot belongs to an old version", async () => {
    const { client } = createSourceClient(
      currentSnapshotTables({ currentVersion: 2, snapshotVersionId: VERSION_1_ID }),
    );
    await assert.rejects(
      () => resolveDistributionScheduleLessons(client as never, PLAN_ID, 2),
      assertFailClosed,
    );
  });

  it("fails closed when the current-version snapshot is not current", async () => {
    const { client } = createSourceClient(currentSnapshotTables({ isCurrent: false }));
    await assert.rejects(
      () => resolveDistributionScheduleLessons(client as never, PLAN_ID, 1),
      assertFailClosed,
    );
  });

  it("fails closed when the current snapshot has no valid items", async () => {
    const { client, reads } = createSourceClient(
      currentSnapshotTables({
        items: [
          {
            snapshot_id: SNAPSHOT_A_ID,
            order_index: 1,
            unit: "وحدة",
            lesson: "   ",
            periods: 0,
            notes: "",
            curriculum_lesson_id: null,
          },
        ],
      }),
    );
    await assert.rejects(
      () => resolveDistributionScheduleLessons(client as never, PLAN_ID, 1),
      assertFailClosed,
    );
    assert.equal(reads.includes("curriculum_lessons"), false);
  });

  it("does not use version 1 snapshot after the plan moves to version 2", async () => {
    const { client } = createSourceClient(
      currentSnapshotTables({ snapshotVersionId: VERSION_1_ID, isCurrent: true }),
    );
    await assert.rejects(
      () => resolveDistributionScheduleLessons(client as never, PLAN_ID, 2),
      assertFailClosed,
    );
  });

  it("uses snapshot B after it replaces snapshot A on the same version", async () => {
    const { client } = createSourceClient({
      semester_plan_versions: [
        {
          id: VERSION_1_ID,
          semester_plan_id: PLAN_ID,
          version_number: 1,
        },
      ],
      distribution_snapshots: [
        {
          id: SNAPSHOT_A_ID,
          semester_plan_id: PLAN_ID,
          semester_plan_version_id: VERSION_1_ID,
          is_current: false,
        },
        {
          id: SNAPSHOT_B_ID,
          semester_plan_id: PLAN_ID,
          semester_plan_version_id: VERSION_1_ID,
          is_current: true,
        },
      ],
      distribution_snapshot_items: [
        {
          snapshot_id: SNAPSHOT_A_ID,
          order_index: 1,
          unit: "قديم",
          lesson: "لقطة أ",
          periods: 2,
          notes: "",
          curriculum_lesson_id: null,
        },
        {
          snapshot_id: SNAPSHOT_B_ID,
          order_index: 1,
          unit: "جديد",
          lesson: "لقطة ب",
          periods: 3,
          notes: "",
          curriculum_lesson_id: null,
        },
      ],
    });
    const current = await resolveDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(current?.snapshotId, SNAPSHOT_B_ID);
    assert.equal(current?.lessons.length, 1);
    assert.equal(current?.lessons[0]?.title, "لقطة ب");
    assert.equal(current?.lessons[0]?.periodsCount, 3);
    assert.equal(
      current?.lessons.some((lesson) => lesson.title === "لقطة أ"),
      false,
    );
  });

  it("does not use a snapshot that belongs to another plan", async () => {
    const { client } = createSourceClient({
      semester_plan_versions: [
        {
          id: VERSION_1_ID,
          semester_plan_id: PLAN_ID,
          version_number: 1,
        },
      ],
      distribution_snapshots: [
        {
          id: SNAPSHOT_A_ID,
          semester_plan_id: OTHER_PLAN_ID,
          semester_plan_version_id: VERSION_1_ID,
          is_current: true,
        },
      ],
      distribution_snapshot_items: snapshotItems(),
    });
    const lessons = await resolveDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("never writes on success or fail-closed paths", async () => {
    const success = createSourceClient(currentSnapshotTables());
    await resolveDistributionScheduleLessons(success.client as never, PLAN_ID, 1);
    assert.equal(success.writes.length, 0);

    const closed = createSourceClient(currentSnapshotTables({ isCurrent: false }));
    await assert.rejects(
      () => resolveDistributionScheduleLessons(closed.client as never, PLAN_ID, 1),
      assertFailClosed,
    );
    assert.equal(closed.writes.length, 0);
    assert.equal(closed.reads.includes("curriculum_lessons"), false);
  });
});

describe("planner snapshot source contracts", () => {
  it("generateSchedule uses the resolved snapshot source and keeps legacy curriculum only after it", () => {
    const engine = readFileSync(ENGINE_FILE, "utf8");
    assert.match(engine, /resolveDistributionScheduleLessons/);
    assert.doesNotMatch(engine, /loadCurrentDistributionScheduleLessons/);
    assert.match(engine, /from\("curriculum_lessons"\)/);
    const snapshotIdx = engine.indexOf("resolveDistributionScheduleLessons");
    const curriculumIdx = engine.indexOf('from("curriculum_lessons")');
    assert.ok(snapshotIdx > 0);
    assert.ok(curriculumIdx > snapshotIdx);
    assert.match(engine, /fromSnapshot\?\.lessons\.length/);
    assert.match(engine, /distributionSnapshotId = fromSnapshot\.snapshotId/);
    assert.match(engine, /if \(parsedLessons\.length === 0\)/);
    const constructorStamps = engine.match(/distributionSnapshotId,/g) ?? [];
    assert.ok(constructorStamps.length >= 3);
  });

  it("does not auto-create snapshots or write curriculum from the source module", () => {
    const src = readFileSync(SOURCE_FILE, "utf8");
    assert.doesNotMatch(src, /\.insert\s*\(/);
    assert.doesNotMatch(src, /\.update\s*\(/);
    assert.doesNotMatch(src, /\.upsert\s*\(/);
    assert.doesNotMatch(src, /\.delete\s*\(/);
    assert.doesNotMatch(src, /syncSheetsToSupabaseAdmin/);
    assert.doesNotMatch(src, /\.from\("curriculum_lessons"\)/);
    assert.match(src, /DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE/);
    assert.match(
      src,
      /لا توجد لقطة توزيع معتمدة للإصدار الحالي من الخطة\. أعد استيراد التوزيع واعتماده قبل توليد الخطة\./,
    );
    assert.doesNotMatch(src, /1447/);
  });
});
