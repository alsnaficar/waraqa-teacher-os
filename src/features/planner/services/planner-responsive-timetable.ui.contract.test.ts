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

describe("TASK 25.14 superseded: slot-CRUD TeacherWeeklyTimetable is not the weekly planner", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("does not mount slot-CRUD TeacherWeeklyTimetable as the weekly planner view", () => {
    assert.match(planner, /FilledWeeklyTimetable/);
    assert.doesNotMatch(planner, /import \{ TeacherWeeklyTimetable \}/);
    assert.doesNotMatch(planner, /<TeacherWeeklyTimetable[\s/>]/);
    assert.doesNotMatch(planner, /PlannerDesktopGrid/);
    assert.match(planner, /SemesterPlanTable/);
  });

  it("keeps TeacherWeeklyTimetable in the repository without using it on /planner", () => {
    assert.equal(
      existsSync(
        path.join(
          repoRoot,
          "src/features/teacher-timetable/components/teacher-weekly-timetable.tsx",
        ),
      ),
      true,
    );
    assert.match(bottomNav, /التقارير/);
    assert.doesNotMatch(planner, /teacher_id/);
  });
});
