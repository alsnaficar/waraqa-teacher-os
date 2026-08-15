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

describe("TASK 25.15 superseded: historical PlannerDesktopGrid is not the weekly body", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const toolbar = readSrc("../components/planner-toolbar.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("weekly view does not mount historical planner layouts or slot-CRUD timetable", () => {
    assert.match(planner, /FilledWeeklyTimetable/);
    assert.doesNotMatch(planner, /PlannerMobileLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopLayout/);
    assert.doesNotMatch(planner, /weekLayoutProps/);
    assert.match(planner, /SemesterPlanTable/);
    assert.doesNotMatch(planner, /import \{ TeacherWeeklyTimetable \}/);
    assert.doesNotMatch(planner, /<TeacherWeeklyTimetable[\s/>]/);
  });

  it("top nav keeps الجدول الأسبوعي and خطة الفصل only", () => {
    const top = planner.slice(
      planner.indexOf("الخطة والجدول الدراسي"),
      planner.indexOf('view === "semester"'),
    );
    assert.match(top, /الجدول الأسبوعي/);
    assert.match(top, /خطة الفصل/);
    assert.doesNotMatch(top, /إدارة الجدول/);
    assert.doesNotMatch(top, /تحضير اليوم/);
    assert.doesNotMatch(top, /تحضير الأسبوع/);
    assert.doesNotMatch(planner, /TimetablePreparationActions/);
  });

  it("PlannerToolbar keeps preparation destinations", () => {
    assert.match(toolbar, /تحضير اليوم/);
    assert.match(toolbar, /تحضير الأسبوع/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
    assert.match(readSrc("../components/planner-legend.tsx"), /export function PlannerLegend/);
  });

  it("BottomNav still contains التقارير and timetable files remain in repo", () => {
    assert.match(bottomNav, /التقارير/);
    assert.doesNotMatch(bottomNav, /التحضير/);
    assert.equal(
      existsSync(
        path.join(
          repoRoot,
          "src/features/teacher-timetable/components/teacher-weekly-timetable.tsx",
        ),
      ),
      true,
    );
  });
});
