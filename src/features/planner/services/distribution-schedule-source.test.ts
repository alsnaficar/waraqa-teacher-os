import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadCurrentDistributionScheduleLessons,
  mapSnapshotItemsToScheduleLessons,
} from "./distribution-schedule-source.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SOURCE_FILE = join(ROOT, "src/features/planner/services/distribution-schedule-source.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");

const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_ID = "88888888-8888-4888-8888-888888888888";
const SNAPSHOT_ID = "77777777-7777-4777-8777-777777777777";
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

function snapshotItems() {
  return [
    {
      order_index: 2,
      unit: "الوحدة الثانية",
      lesson: "الدرس الثاني",
      periods: 1,
      notes: "",
      curriculum_lesson_id: null,
    },
    {
      order_index: 1,
      unit: "الوحدة الأولى",
      lesson: "الدرس الأول",
      periods: 2,
      notes: "ملاحظة",
      curriculum_lesson_id: LESSON_ID,
    },
  ];
}

function mockClient(options: {
  versionId?: string | null;
  snapshot?: { id: string; versionId: string; isCurrent?: boolean } | null;
  items?: ReturnType<typeof snapshotItems> | null;
  writes?: string[];
}) {
  const writes = options.writes ?? [];
  return {
    from(table: string) {
      writes.push(table);
      if (table === "semester_plan_versions") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        if (!options.versionId) return { data: null, error: null };
                        return { data: { id: options.versionId }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "distribution_snapshots") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            if (!options.snapshot) return { data: null, error: null };
                            return { data: { id: options.snapshot.id }, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert() {
            writes.push("distribution_snapshots:insert");
            throw new Error("must not insert snapshots from generateSchedule");
          },
        };
      }
      if (table === "distribution_snapshot_items") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({
                      data: options.items ?? [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          insert() {
            writes.push("distribution_snapshot_items:insert");
            throw new Error("must not insert snapshot items from generateSchedule");
          },
        };
      }
      if (table === "curriculum_lessons" || table === "curriculum_files") {
        writes.push(`${table}:fallback`);
        return {
          select() {
            return {
              eq() {
                return this;
              },
              order() {
                return Promise.resolve({ data: [], error: null });
              },
              limit() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("mapSnapshotItemsToScheduleLessons", () => {
  it("orders snapshot items and preserves periods and curriculum ids", () => {
    const lessons = mapSnapshotItemsToScheduleLessons(snapshotItems());
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
    const client = mockClient({
      versionId: VERSION_ID,
      snapshot: { id: SNAPSHOT_ID, versionId: VERSION_ID },
      items: snapshotItems(),
    });
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 4);
    assert.equal(lessons?.length, 2);
    assert.equal(lessons?.[0]?.title, "الدرس الأول");
    assert.equal(lessons?.[0]?.periodsCount, 2);
  });

  it("returns null when the current version has no snapshot so curriculum can fall back", async () => {
    const client = mockClient({
      versionId: VERSION_ID,
      snapshot: null,
      items: snapshotItems(),
    });
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("ignores a snapshot that belongs to another version", async () => {
    const client = mockClient({
      versionId: VERSION_ID,
      snapshot: null,
    });
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 4);
    assert.equal(lessons, null);
  });

  it("returns null for an empty snapshot instead of synthesizing curriculum rows", async () => {
    const client = mockClient({
      versionId: VERSION_ID,
      snapshot: { id: SNAPSHOT_ID, versionId: VERSION_ID },
      items: [],
    });
    const lessons = await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(lessons, null);
  });

  it("never inserts snapshot or curriculum rows", async () => {
    const writes: string[] = [];
    const client = mockClient({
      versionId: VERSION_ID,
      snapshot: { id: SNAPSHOT_ID, versionId: VERSION_ID },
      items: snapshotItems(),
      writes,
    });
    await loadCurrentDistributionScheduleLessons(client as never, PLAN_ID, 1);
    assert.equal(
      writes.some((entry) => entry.includes("insert")),
      false,
    );
    assert.ok(writes.includes("distribution_snapshots"));
    assert.ok(writes.includes("distribution_snapshot_items"));
  });
});

describe("planner snapshot source contracts", () => {
  it("generateSchedule prefers the current snapshot and keeps curriculum fallback", () => {
    const engine = readFileSync(ENGINE_FILE, "utf8");
    assert.match(engine, /loadCurrentDistributionScheduleLessons/);
    assert.match(engine, /from\("curriculum_lessons"\)/);
    const snapshotIdx = engine.indexOf("loadCurrentDistributionScheduleLessons");
    const curriculumIdx = engine.indexOf('from("curriculum_lessons")');
    assert.ok(snapshotIdx > 0);
    assert.ok(curriculumIdx > snapshotIdx);
    assert.match(engine, /if \(parsedLessons\.length === 0\)/);
  });

  it("does not auto-create snapshots or write curriculum from the source module", () => {
    const src = readFileSync(SOURCE_FILE, "utf8");
    assert.doesNotMatch(src, /\.insert\s*\(/);
    assert.doesNotMatch(src, /\.update\s*\(/);
    assert.doesNotMatch(src, /\.upsert\s*\(/);
    assert.doesNotMatch(src, /\.delete\s*\(/);
    assert.doesNotMatch(src, /syncSheetsToSupabaseAdmin/);
    assert.doesNotMatch(src, /\.from\("curriculum_lessons"\)/);
  });
});
