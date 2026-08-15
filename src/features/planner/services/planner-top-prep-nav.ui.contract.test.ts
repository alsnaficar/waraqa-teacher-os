import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 25.13 planner top navigation has no duplicate preparation buttons", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const toolbar = readSrc("../components/planner-toolbar.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("top planner area keeps only الجدول الأسبوعي and خطة الفصل", () => {
    const top = planner.slice(
      planner.indexOf("الخطة والجدول الدراسي"),
      planner.indexOf("view === \"semester\""),
    );
    assert.match(top, /الجدول الأسبوعي/);
    assert.match(top, /خطة الفصل/);
    assert.doesNotMatch(top, /تحضير اليوم/);
    assert.doesNotMatch(top, /تحضير الأسبوع/);
    assert.doesNotMatch(planner, /TimetablePreparationActions/);
    assert.doesNotMatch(planner, /إدارة الجدول/);
  });

  it("weekly plan card toolbar keeps the five original actions and prep links", () => {
    assert.match(toolbar, /تحضير اليوم/);
    assert.match(toolbar, /تحضير الأسبوع/);
    assert.match(toolbar, /نشر الخطة/);
    assert.match(toolbar, /onClick=\{\(\) => onComingSoon\("حذف اليوم"\)\}/);
    assert.match(toolbar, /onClick=\{\(\) => onComingSoon\("حذف الأسبوع"\)\}/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
  });

  it("BottomNav still contains التقارير and does not contain التحضير", () => {
    assert.match(bottomNav, /التقارير/);
    assert.match(bottomNav, /["']\/reports["']/);
    assert.doesNotMatch(bottomNav, /التحضير/);
  });
});
