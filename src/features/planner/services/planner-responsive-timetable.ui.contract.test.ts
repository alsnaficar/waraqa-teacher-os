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

describe("TASK 25.14 restore responsive weekly timetable mount", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const timetable = readSrc(
    "../../teacher-timetable/components/teacher-weekly-timetable.tsx",
  );
  const mobile = readSrc(
    "../../teacher-timetable/components/teacher-weekly-timetable-mobile.tsx",
  );
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("weekly view mounts TeacherWeeklyTimetable and keeps semester plan", () => {
    assert.match(planner, /<TeacherWeeklyTimetable \/>/);
    assert.match(planner, /view === "semester"/);
    assert.match(planner, /SemesterPlanTable/);
    assert.match(planner, /الجدول الأسبوعي/);
    assert.match(planner, /خطة الفصل/);
    assert.doesNotMatch(planner, /إدارة الجدول/);
    assert.doesNotMatch(planner, /TimetablePreparationActions/);
  });

  it("top navigation does not include preparation buttons", () => {
    const top = planner.slice(
      planner.indexOf("الخطة والجدول الدراسي"),
      planner.indexOf('view === "semester"'),
    );
    assert.doesNotMatch(top, /تحضير اليوم/);
    assert.doesNotMatch(top, /تحضير الأسبوع/);
  });

  it("responsive timetable components remain used without rewriting CSS", () => {
    assert.match(timetable, /TeacherWeeklyTimetableMobile/);
    assert.match(timetable, /lg:hidden/);
    assert.match(timetable, /hidden min-w-0 lg:block/);
    assert.match(timetable, /min-w-\[920px\]/);
    assert.match(mobile, /lg:hidden/);
    assert.match(mobile, /min-h-11/);
    assert.equal(
      existsSync(
        path.join(
          repoRoot,
          "src/features/teacher-timetable/components/teacher-weekly-timetable-mobile.tsx",
        ),
      ),
      true,
    );
  });

  it("planner UI does not introduce client teacher_id or direct Supabase writes", () => {
    assert.doesNotMatch(planner, /teacher_id/);
    assert.doesNotMatch(planner, /\.insert\(|\.update\(|\.delete\(/);
    assert.match(bottomNav, /التقارير/);
    assert.doesNotMatch(bottomNav, /التحضير/);
  });
});
