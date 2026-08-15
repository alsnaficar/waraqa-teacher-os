import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 25.36 weekly Family C uses batched lesson options", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const selector = readSrc(
    "../../teacher-timetable/components/teacher-timetable-lesson-controls.tsx",
  );
  const provider = readSrc(
    "../../teacher-timetable/components/weekly-lesson-options-context.tsx",
  );
  const serverFns = readSrc("../../../platform/lesson-sessions/get-lesson-options.functions.ts");
  const loader = readSrc("../../lesson-sessions/services/lesson-options.ts");

  it("weekly grid loads options through the shared batch query, not per cell", () => {
    assert.match(weekly, /WeeklyLessonOptionsProvider/);
    assert.match(weekly, /lessonSessionIds=\{weeklyLessonSessionIds\}/);
    assert.match(provider, /planner-weekly-lesson-options/);
    assert.match(provider, /getLessonOptionsBatch/);
    assert.match(provider, /queryKey: weeklyLessonOptionsQueryKey\(sortedIds\)/);
    assert.match(selector, /enabled: !useWeeklyBatch/);
    assert.match(selector, /queryKey: \["lesson-options", lessonSessionId\]/);
    assert.match(selector, /جاري التحديد\.\.\./);
  });

  it("batch server function authorizes the teacher and reuses the shared loader", () => {
    assert.match(serverFns, /export const getLessonOptionsBatch/);
    assert.match(
      serverFns,
      /export const getLessonOptionsBatch[\s\S]*middleware\(\[requireSupabaseAuth\]\)/,
    );
    assert.match(serverFns, /loadLessonOptionsForOwnedSessions/);
    assert.match(loader, /getOwnedSessionsByIds/);
    assert.match(loader, /resolvePublishedCurriculumFileIdsByScope/);
    assert.match(loader, /listPublishedCurriculumLessonsByFileIds/);
    assert.doesNotMatch(loader, /ensureSessionsForDate\(/);
    assert.doesNotMatch(loader, /generateSessionsForDate\(/);
  });

  it("keeps TASK 25.30 adjacent-week session prefetch unchanged", () => {
    const prefetchBlock = weekly.slice(
      weekly.indexOf("useEffect(() => {"),
      weekly.indexOf("const datesNeedingEnsure"),
    );

    assert.match(prefetchBlock, /weekOffset - 1/);
    assert.match(prefetchBlock, /weekOffset \+ 1/);
    assert.match(prefetchBlock, /LessonSessionService\.getSessionsByDates\(adjacentWeekDates\)/);
    assert.doesNotMatch(prefetchBlock, /getLessonOptions/);
    assert.doesNotMatch(prefetchBlock, /getLessonOptionsBatch/);
    assert.doesNotMatch(prefetchBlock, /ensureSessionsForDate/);
    assert.doesNotMatch(prefetchBlock, /generateSessionsForDate/);
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(weekly, /const weekSwitchPending = existingSessionsQuery\.isPlaceholderData/);
  });

  it("does not change Family C header, publish, or attendance presentation", () => {
    const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
    const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
    const header = weekly.slice(headerStart, headerEnd);

    assert.match(header, /نشر الخطة/);
    assert.match(header, /منصة مدرستي/);
    assert.match(header, /المدير وولي الأمر/);
    assert.match(header, /useState<"in_person" \| "remote">\("in_person"\)/);
    assert.match(header, /max-w-\[21rem\]/);
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(weekly, /min-w-\[920px\]/);
    assert.doesNotMatch(weekly, /PublishModal/);
  });
});
