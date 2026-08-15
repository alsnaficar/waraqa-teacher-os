import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.8 reports page hub contract", () => {
  it("uses shared hub hook, unified filter, homework/test CTAs, and print entry", () => {
    const page = readFileSync(path.join(here, "../components/reports-page-content.tsx"), "utf8");
    assert.match(page, /useReportsHub/);
    assert.match(page, /REPORTS_HUB_DEFAULT_FILTER|appliedFilter/);
    assert.match(page, /REPORTS_FILTER_OPTIONS/);
    assert.match(page, /REPORTS_HUB_HOMEWORK_CTA|تفاصيل الواجبات/);
    assert.match(page, /REPORTS_HUB_TESTS_CTA|تفاصيل الاختبارات/);
    assert.match(page, /REPORTS_HUB_PRINT_BUTTON_LABEL|طباعة التقرير/);
    assert.match(page, /to=["']\/homework["']/);
    assert.match(page, /to=["']\/tests["']/);
    assert.doesNotMatch(page, /HomeworkReportsPanel|TestReportsPanel/);
    assert.doesNotMatch(page, /teacher_id\s*[:=]/);
    assert.doesNotMatch(page, /supabase\.from/);
  });

  it("bottom nav includes /reports after TASK 25.9A (not lesson-sessions)", () => {
    const bottomNav = readFileSync(
      path.join(here, "../../../components/layout/bottom-nav.tsx"),
      "utf8",
    );
    assert.match(bottomNav, /["']\/reports["']/);
    assert.match(bottomNav, /التقارير/);
    assert.doesNotMatch(bottomNav, /["']\/lesson-sessions["']/);
    assert.doesNotMatch(bottomNav, /التحضير/);
  });
});
