import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION =
  "supabase/migrations/20260813162000_official_academic_calendar_rls.sql";

describe("official academic calendar RLS migration", () => {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");

  it("replaces owner-all policies with separate select and admin writes", () => {
    assert.match(sql, /drop policy if exists "academic_years owner all"/);
    assert.match(sql, /drop policy if exists "semesters owner all"/);
    assert.match(sql, /create policy "academic_years official select"/);
    assert.match(sql, /create policy "academic_years admin insert"/);
    assert.match(sql, /create policy "academic_years admin update"/);
    assert.match(sql, /create policy "academic_years admin delete"/);
    assert.match(sql, /create policy "semesters official select"/);
    assert.match(sql, /create policy "semesters admin insert"/);
    assert.match(sql, /create policy "semesters admin update"/);
    assert.match(sql, /create policy "semesters admin delete"/);
  });

  it("does not use USING (true)", () => {
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.equal(/using\s*\(\s*true\s*\)/i.test(withoutComments), false);
  });

  it("teacher-readable official rows are is_active, not every row", () => {
    assert.match(sql, /is_active = true/);
    assert.match(sql, /auth\.uid\(\) = user_id/);
    assert.match(sql, /public\.has_role\(auth\.uid\(\),\s*'admin'::public\.app_role\)/);
  });

  it("write policies are admin-only and do not use user_id ownership", () => {
    const insertBlocks = sql.match(/create policy "[^"]+ admin insert"[\s\S]*?;/g) ?? [];
    const updateBlocks = sql.match(/create policy "[^"]+ admin update"[\s\S]*?;/g) ?? [];
    const deleteBlocks = sql.match(/create policy "[^"]+ admin delete"[\s\S]*?;/g) ?? [];
    assert.equal(insertBlocks.length, 2);
    assert.equal(updateBlocks.length, 2);
    assert.equal(deleteBlocks.length, 2);
    for (const block of [...insertBlocks, ...updateBlocks, ...deleteBlocks]) {
      assert.match(block, /has_role\(auth\.uid\(\),\s*'admin'::public\.app_role\)/);
      assert.equal(/auth\.uid\(\) = user_id/.test(block), false);
    }
  });

  it("does not mutate data or other tables", () => {
    assert.equal(/\b(insert into|update |delete from)\b/i.test(sql), false);
    assert.equal(/alter table/i.test(sql), false);
    assert.equal(/lesson_sessions|semester_plans|planner_entries|region_id/.test(sql), false);
  });
});
