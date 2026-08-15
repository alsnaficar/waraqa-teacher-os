import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 25.23 weekly timetable initial load", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const hook = readSrc("../../teacher-timetable/hooks/useTeacherTimetable.ts");
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const sessions = readSrc("../../lesson-sessions/services/lesson-session.service.ts");

  it("empty-state renders only after timetable loading completes with zero entries", () => {
    const loadingIdx = weekly.indexOf(
      "const showLoading = loading || (entries.length > 0 && sessionsPending)",
    );
    const skeletonIdx = weekly.indexOf("if (showLoading)");
    const emptyIdx = weekly.indexOf("if (!loading && entries.length === 0)");
    const emptyCopyIdx = weekly.indexOf("لم يتم تسجيل حصص للمعلم في الجدول التشغيلي حتى الآن.");

    assert.notEqual(loadingIdx, -1);
    assert.notEqual(skeletonIdx, -1);
    assert.notEqual(emptyIdx, -1);
    assert.ok(skeletonIdx < emptyIdx);
    assert.ok(emptyIdx < emptyCopyIdx);
    assert.match(weekly, /لا يوجد جدول أسبوعي/);
    assert.doesNotMatch(
      weekly.slice(emptyIdx),
      /if \(entries\.length === 0\) \{\s*return/,
    );
  });

  it("fetches the timetable once and reads the five week dates in one session query", () => {
    assert.match(hook, /queryKey: teacherTimetableQueryKey/);
    assert.match(hook, /TeacherTimetableService\.getTimetable\(\)/);
    assert.match(hook, /loading: query\.isPending/);
    assert.match(weekly, /getSessionsByDates\(weekDates\)/);
    assert.match(sessions, /in\("session_date", uniqueDates\)/);
    assert.match(weekly, /ensureSessionsForDate\(date\)/);
    assert.match(weekly, /datesNeedingEnsure/);
    assert.doesNotMatch(weekly, /queryKey: \["lesson-sessions"/);
  });

  it("does not block the weekly view on semester-plan page loading", () => {
    assert.match(planner, /useState<PlannerView>\("week"\)/);
    assert.match(planner, /<FilledWeeklyTimetable \/>/);
    assert.doesNotMatch(
      planner.slice(0, planner.indexOf("return (")),
      /if \(loading\) \{\s*return/,
    );
  });
});
