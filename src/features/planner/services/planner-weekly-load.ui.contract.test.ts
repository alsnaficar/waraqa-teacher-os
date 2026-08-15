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
    const loadingIdx = weekly.indexOf("const showLoading =");
    const skeletonIdx = weekly.indexOf("if (showLoading)");
    const emptyIdx = weekly.indexOf("if (!loading && entries.length === 0)");
    const emptyCopyIdx = weekly.indexOf("لم يتم تسجيل حصص للمعلم في الجدول التشغيلي حتى الآن.");

    assert.notEqual(loadingIdx, -1);
    assert.notEqual(skeletonIdx, -1);
    assert.notEqual(emptyIdx, -1);
    assert.ok(skeletonIdx < emptyIdx);
    assert.ok(emptyIdx < emptyCopyIdx);
    assert.match(weekly, /لا يوجد جدول أسبوعي/);
    assert.match(
      weekly,
      /entries\.length > 0 && sessionsPending && existingSessionsQuery\.data === undefined/,
    );
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

describe("TASK 25.28 week switch keeps previous timetable visible", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");

  it("uses React Query keepPreviousData and does not skeleton on week-session fetch", () => {
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(weekly, /existingSessionsQuery\.isPlaceholderData/);
    assert.match(
      weekly,
      /entries\.length > 0 && sessionsPending && existingSessionsQuery\.data === undefined/,
    );
    assert.match(weekly, /aria-label="جاري تحميل الأسبوع"/);
    assert.match(weekly, /switching=\{weekSwitchPending\}/);
    assert.doesNotMatch(
      weekly,
      /const showLoading = loading \|\| \(entries\.length > 0 && sessionsPending\)/,
    );
  });
});

describe("TASK 25.29 week spinner only for uncached week transition", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const mobile = readSrc(
    "../../teacher-timetable/components/teacher-weekly-timetable-mobile.tsx",
  );

  it("new uncached week can show the indicator via isPlaceholderData", () => {
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(
      weekly,
      /const weekSwitchPending = existingSessionsQuery\.isPlaceholderData/,
    );
    assert.match(weekly, /switching=\{weekSwitchPending\}/);
    assert.match(weekly, /aria-label="جاري تحميل الأسبوع"/);
  });

  it("cached week background isFetching does not drive the week spinner", () => {
    const spinnerBlock = weekly.slice(
      weekly.indexOf("const weekSwitchPending"),
      weekly.indexOf("const sessionBySlot"),
    );
    assert.match(spinnerBlock, /isPlaceholderData/);
    assert.doesNotMatch(spinnerBlock, /isFetching/);
    assert.doesNotMatch(spinnerBlock, /ensureQueries/);
  });

  it("Family C desktop table and mobile/tablet cards remain unchanged", () => {
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(mobile, /lg:hidden/);
    assert.match(weekly, /hidden min-w-0 lg:block/);
    assert.match(weekly, /min-w-\[920px\]/);
    assert.match(weekly, /overflow-x-auto/);
    assert.match(weekly, /staleTime: 30_000/);
  });
});

describe("TASK 25.30 adjacent week session prefetch", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");

  it("prefetches previous and next week with getSessionsByDates only", () => {
    const prefetchStart = weekly.indexOf("queryClient.prefetchQuery");
    assert.notEqual(prefetchStart, -1);

    const prefetchBlock = weekly.slice(
      weekly.indexOf("useEffect(() => {"),
      weekly.indexOf("const datesNeedingEnsure"),
    );

    assert.match(prefetchBlock, /weekOffset - 1/);
    assert.match(prefetchBlock, /weekOffset \+ 1/);
    assert.match(
      prefetchBlock,
      /queryKey: \["planner-weekly-session-slots", \.\.\.adjacentWeekDates\]/,
    );
    assert.match(prefetchBlock, /LessonSessionService\.getSessionsByDates\(adjacentWeekDates\)/);
    assert.match(prefetchBlock, /staleTime: 30_000/);
    assert.match(prefetchBlock, /isSuccess/);
    assert.match(prefetchBlock, /isPlaceholderData/);
    assert.doesNotMatch(prefetchBlock, /ensureSessionsForDate/);
    assert.doesNotMatch(prefetchBlock, /generateSessionsForDate/);
    assert.doesNotMatch(prefetchBlock, /weekOffset - 2/);
    assert.doesNotMatch(prefetchBlock, /weekOffset \+ 2/);
  });

  it("does not recursively prefetch and keeps 25.29 spinner on isPlaceholderData only", () => {
    assert.match(
      weekly,
      /for \(const adjacentOffset of \[weekOffset - 1, weekOffset \+ 1\]\)/,
    );
    assert.doesNotMatch(weekly, /weekOffset - 2|weekOffset \+ 2/);
    assert.match(
      weekly,
      /const weekSwitchPending = existingSessionsQuery\.isPlaceholderData/,
    );
    const spinnerBlock = weekly.slice(
      weekly.indexOf("const weekSwitchPending"),
      weekly.indexOf("const sessionBySlot"),
    );
    assert.doesNotMatch(spinnerBlock, /isFetching/);
  });
});
