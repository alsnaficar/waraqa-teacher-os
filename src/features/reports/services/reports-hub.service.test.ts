import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.8 ReportsHubService contract", () => {
  it("composes existing report services via resolveUserContext; no client teacher_id", () => {
    const source = readFileSync(path.join(here, "reports-hub.service.ts"), "utf8");
    assert.match(source, /resolveUserContext/);
    assert.match(source, /ReportsService\.getLessonSessionReport/);
    assert.match(source, /HomeworkReportsService\.getPeriodReport/);
    assert.match(source, /TestReportsService\.getPeriodReport/);
    assert.match(source, /Promise\.allSettled/);
    assert.match(source, /enrichReportWithLessonTitles/);
    assert.doesNotMatch(source, /teacher_id\s*[:=]/);
    assert.doesNotMatch(source, /\.from\(/);
  });

  it("hook shares one queryKey and never accepts teacher_id", () => {
    const hook = readFileSync(path.join(here, "../hooks/useReportsHub.ts"), "utf8");
    assert.match(hook, /ReportsHubService\.getSnapshot/);
    assert.match(hook, /reportsHubQueryKey/);
    assert.match(hook, /\["reports", "hub"/);
    assert.doesNotMatch(hook, /teacher_id\s*[:=]/);
    assert.doesNotMatch(hook, /teacherId\s*[:=]/);
  });
});
