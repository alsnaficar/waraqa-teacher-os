import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.11 timetable preparation destinations", () => {
  it("weekly toolbar keeps preparation links to existing routes", () => {
    const toolbar = readFileSync(
      path.join(here, "../../planner/components/planner-toolbar.tsx"),
      "utf8",
    );

    assert.match(toolbar, /تحضير اليوم/);
    assert.match(toolbar, /تحضير الأسبوع/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
    assert.doesNotMatch(toolbar, /supabase|teacher_id\s*[:=]/);
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
