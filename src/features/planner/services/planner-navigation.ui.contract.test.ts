import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 25.12 planner navigation contract", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const toolbar = readSrc("../components/planner-toolbar.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("planner navigation renders only الجدول الأسبوعي and خطة الفصل", () => {
    assert.match(planner, /PLANNER_NAV_ITEMS/);
    assert.match(planner, /الجدول الأسبوعي/);
    assert.match(planner, /خطة الفصل/);
    assert.match(planner, /type PlannerView = "week" \| "semester"/);
    assert.doesNotMatch(planner, /إدارة الجدول/);
    assert.doesNotMatch(planner, /"slots"/);
    assert.doesNotMatch(planner, /setView\(["']slots["']\)/);
  });

  it("does not mount a third timetable-management tab", () => {
    const navBlock = planner.slice(
      planner.indexOf("export const PLANNER_NAV_ITEMS"),
      planner.indexOf("function formatUpdatedAt"),
    );
    assert.match(navBlock, /الجدول الأسبوعي/);
    assert.match(navBlock, /خطة الفصل/);
    assert.equal((navBlock.match(/view: "/g) ?? []).length, 2);
    assert.doesNotMatch(planner, /import \{ TeacherWeeklyTimetable \}/);
    assert.doesNotMatch(planner, /<TeacherWeeklyTimetable/);
    assert.doesNotMatch(planner, /إدارة الجدول/);
  });

  it("keeps preparation toolbar labels without duplicating them in top navigation", () => {
    assert.doesNotMatch(planner, /TimetablePreparationActions/);
    assert.match(toolbar, /تحضير اليوم/);
    assert.match(toolbar, /تحضير الأسبوع/);
    assert.match(toolbar, /نشر الخطة/);
    assert.match(toolbar, />\s*حذف\s*</);
    assert.match(toolbar, /onClick=\{\(\) => onComingSoon\("حذف اليوم"\)\}/);
    assert.match(toolbar, /onClick=\{\(\) => onComingSoon\("حذف الأسبوع"\)\}/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
  });

  it("keeps filled weekly timetable, legend, and timetable routes without deleting them", () => {
    assert.match(planner, /FilledWeeklyTimetable/);
    assert.doesNotMatch(planner, /PlannerMobileLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopGrid/);
    assert.doesNotMatch(planner, /import \{ TeacherWeeklyTimetable \}/);
    assert.doesNotMatch(planner, /<TeacherWeeklyTimetable[\s/>]/);
    assert.match(readSrc("../components/planner-legend.tsx"), /export function PlannerLegend/);
    assert.equal(
      existsSync(
        path.join(
          repoRoot,
          "src/features/teacher-timetable/components/teacher-weekly-timetable.tsx",
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "src/routes/_authenticated/lesson-sessions.tsx")),
      true,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "src/routes/_authenticated/weekly-preparation.tsx")),
      true,
    );
  });

  it("BottomNav still contains التقارير and does not contain التحضير", () => {
    assert.match(bottomNav, /التقارير/);
    assert.match(bottomNav, /["']\/reports["']/);
    assert.doesNotMatch(bottomNav, /التحضير/);
    assert.doesNotMatch(bottomNav, /["']\/lesson-sessions["']/);
    assert.doesNotMatch(bottomNav, /["']\/weekly-preparation["']/);
  });
});
