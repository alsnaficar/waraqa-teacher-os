/**
 * Step 6A — teacher_timetable admin SELECT scope.
 * SQL contracts + predicate logic. No DB push, no writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OWNER_MIGRATION = join(ROOT, "supabase/migrations/20260807000200_teacher_timetable.sql");
const ADMIN_SELECT_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260813200000_teacher_timetable_admin_select.sql",
);
const CAPACITY_FILE = join(ROOT, "src/features/planner/services/distribution-capacity.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");

const TEACHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function withoutSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** SELECT: owner policy OR admin SELECT policy. */
function canSelectTimetable(rowTeacherId: string, authUid: string, isAdmin: boolean): boolean {
  return authUid === rowTeacherId || isAdmin;
}

/** INSERT / UPDATE / DELETE: owner FOR ALL only. Admin gets no extra writes. */
function canWriteTimetable(rowTeacherId: string, authUid: string, _isAdmin: boolean): boolean {
  return authUid === rowTeacherId;
}

describe("teacher_timetable admin SELECT migration", () => {
  it("adds has_role(admin) SELECT without USING(true) or write-policy changes", () => {
    const owner = readFileSync(OWNER_MIGRATION, "utf8");
    const sql = readFileSync(ADMIN_SELECT_MIGRATION, "utf8");
    const body = withoutSqlComments(sql);

    assert.match(owner, /create policy "teacher timetable owner"/);
    assert.match(owner, /for all/i);
    assert.match(owner, /auth\.uid\(\) = teacher_id/);

    assert.match(sql, /create policy "teacher timetable admin select"/);
    assert.match(body, /for select/i);
    assert.match(body, /to authenticated/);
    assert.match(body, /has_role\(\s*auth\.uid\(\),\s*'admin'::public\.app_role\)/);

    assert.equal(/using\s*\(\s*true\s*\)/i.test(body), false);
    assert.equal(/for\s+(insert|update|delete|all)\b/i.test(body), false);
    assert.equal(/with check/i.test(body), false);
    assert.equal(/grant\s+/i.test(body), false);
    assert.equal(/service_role/i.test(body), false);
    assert.equal(/drop policy if exists "teacher timetable owner"/i.test(sql), false);
    assert.equal(
      /update public\.(academic_years|semesters|lesson_sessions|semester_plans|planner_entries|calendar_variants|calendar_exceptions)/i.test(
        body,
      ),
      false,
    );
  });

  it("does not change generateSchedule or use service_role in capacity reads", () => {
    const sql = readFileSync(ADMIN_SELECT_MIGRATION, "utf8");
    const capacity = readFileSync(CAPACITY_FILE, "utf8");
    const engine = readFileSync(ENGINE_FILE, "utf8");

    assert.doesNotMatch(sql, /generateSchedule/);
    assert.doesNotMatch(capacity, /service_role/);
    assert.match(capacity, /plan\.user_id/);
    assert.match(engine, /export async function generateSchedule/);
    assert.match(engine, /const teachingSlots = buildPlanTeachingSlots\(/);
  });
});

describe("teacher_timetable RLS predicates", () => {
  it("lets a teacher read their own timetable", () => {
    assert.equal(canSelectTimetable(TEACHER_A, TEACHER_A, false), true);
  });

  it("blocks a teacher from reading another teacher's timetable", () => {
    assert.equal(canSelectTimetable(TEACHER_A, TEACHER_B, false), false);
  });

  it("lets an admin read another teacher's timetable", () => {
    assert.equal(canSelectTimetable(TEACHER_A, ADMIN, true), true);
  });

  it("does not grant admin extra INSERT/UPDATE/DELETE on another teacher's rows", () => {
    assert.equal(canWriteTimetable(TEACHER_A, ADMIN, true), false);
    assert.equal(canWriteTimetable(TEACHER_A, TEACHER_A, false), true);
    assert.equal(canWriteTimetable(TEACHER_A, TEACHER_B, false), false);
  });
});
