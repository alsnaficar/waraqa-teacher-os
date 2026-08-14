import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = "supabase/migrations/20260813193000_distribution_snapshots.sql";

describe("distribution snapshots migration", () => {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");

  it("adds snapshot tables linked to draft semester plans only", () => {
    assert.match(sql, /create table if not exists public\.distribution_snapshots/);
    assert.match(sql, /create table if not exists public\.distribution_snapshot_items/);
    assert.match(sql, /references public\.semester_plans\(id\) on delete cascade/);
    assert.match(sql, /references public\.semester_plan_versions\(id\) on delete cascade/);
    assert.match(sql, /distribution_snapshots_current_version_uidx/);
    assert.match(sql, /is_semester_plan_owner/);
  });

  it("does not mutate existing calendars, sessions, or the five current plans", () => {
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.equal(/alter table public\.semester_plans/i.test(withoutComments), false);
    assert.equal(/alter table public\.planner_entries/i.test(withoutComments), false);
    assert.equal(/alter table public\.lesson_sessions/i.test(withoutComments), false);
    assert.equal(/alter table public\.calendar_variants/i.test(withoutComments), false);
    assert.equal(/backfill/i.test(withoutComments), false);
    assert.equal(/calendar_variant_id/i.test(withoutComments), false);
    assert.equal(/using\s*\(\s*true\s*\)/i.test(withoutComments), false);
  });
});
