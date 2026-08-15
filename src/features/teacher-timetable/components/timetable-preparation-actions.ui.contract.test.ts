import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.11 timetable preparation actions contract", () => {
  it("planner mounts preparation actions above timetable content", () => {
    const planner = readFileSync(
      path.join(here, "../../../routes/_authenticated/planner.tsx"),
      "utf8",
    );
    const actions = readFileSync(path.join(here, "timetable-preparation-actions.tsx"), "utf8");

    assert.match(planner, /TimetablePreparationActions/);
    assert.match(actions, /تحضير اليوم/);
    assert.match(actions, /تحضير الأسبوع/);
    assert.match(actions, /to=["']\/lesson-sessions["']/);
    assert.match(actions, /to=["']\/weekly-preparation["']/);
    assert.doesNotMatch(actions, /supabase|teacher_id\s*[:=]/);
  });

  it("bottom nav keeps التقارير and does not add التحضير destination", () => {
    const bottomNav = readFileSync(
      path.join(here, "../../../components/layout/bottom-nav.tsx"),
      "utf8",
    );
    assert.match(bottomNav, /["']\/planner["']/);
    assert.match(bottomNav, /["']\/reports["']/);
    assert.match(bottomNav, /التقارير/);
    assert.doesNotMatch(bottomNav, /["']\/lesson-sessions["']/);
    assert.doesNotMatch(bottomNav, /["']\/weekly-preparation["']/);
    assert.doesNotMatch(bottomNav, /التحضير/);
  });
});
