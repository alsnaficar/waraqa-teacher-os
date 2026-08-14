import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = "supabase/migrations/20260813184500_calendar_variants.sql";

describe("calendar variants migration", () => {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");

  it("creates variants, term overrides, exceptions, and a nullable plan FK", () => {
    assert.match(sql, /create table if not exists public\.calendar_variants/);
    assert.match(sql, /create table if not exists public\.calendar_term_overrides/);
    assert.match(sql, /create table if not exists public\.calendar_exceptions/);
    assert.match(sql, /add column if not exists calendar_variant_id uuid/);
    assert.match(sql, /references public\.calendar_variants\(id\) on delete restrict/);
  });

  it("seeds GENERAL and WESTERN catalog rows without dates", () => {
    assert.match(sql, /'GENERAL',\s*'جميع المناطق'/);
    assert.match(sql, /'WESTERN',\s*'المنطقة الغربية'/);
    assert.equal(/insert into public\.calendar_exceptions/i.test(sql), false);
    assert.equal(/insert into public\.calendar_term_overrides/i.test(sql), false);
    assert.equal(/2026-08-30|2027-01-08|2026-08-23/.test(sql), false);
  });

  it("does not use USING (true)", () => {
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.equal(/using\s*\(\s*true\s*\)/i.test(withoutComments), false);
  });

  it("write policies are admin-only", () => {
    const insertBlocks = sql.match(/create policy "[^"]+ admin insert"[\s\S]*?;/g) ?? [];
    const updateBlocks = sql.match(/create policy "[^"]+ admin update"[\s\S]*?;/g) ?? [];
    const deleteBlocks = sql.match(/create policy "[^"]+ admin delete"[\s\S]*?;/g) ?? [];
    assert.equal(insertBlocks.length, 3);
    assert.equal(updateBlocks.length, 3);
    assert.equal(deleteBlocks.length, 3);
    for (const block of [...insertBlocks, ...updateBlocks, ...deleteBlocks]) {
      assert.match(block, /has_role\(auth\.uid\(\),\s*'admin'::public\.app_role\)/);
    }
  });

  it("does not mutate official calendar rows or add region_id", () => {
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    assert.equal(
      /update public\.(academic_years|semesters|lesson_sessions|semester_plans|planner_entries)/i.test(
        withoutComments,
      ),
      false,
    );
    assert.equal(
      /delete from public\.(academic_years|semesters|lesson_sessions|semester_plans|planner_entries)/i.test(
        withoutComments,
      ),
      false,
    );
    assert.equal(/\bregion_id\b/.test(withoutComments), false);
  });
});
