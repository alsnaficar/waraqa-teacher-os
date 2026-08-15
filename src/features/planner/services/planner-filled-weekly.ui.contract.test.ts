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

describe("TASK 25.16 Family C filled weekly planner", () => {
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const mobile = readSrc(
    "../../teacher-timetable/components/teacher-weekly-timetable-mobile.tsx",
  );
  const card = readSrc("../../teacher-timetable/components/teacher-timetable-lesson-card.tsx");
  const hook = readSrc("../../teacher-timetable/hooks/useTeacherTimetable.ts");
  const toolbar = readSrc("../components/planner-toolbar.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  it("weekly view mounts Family C filled timetable, not historical grid or slot CRUD", () => {
    assert.match(planner, /<FilledWeeklyTimetable \/>/);
    assert.doesNotMatch(planner, /PlannerMobileLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopGrid/);
    assert.doesNotMatch(planner, /PlannerMobileTabs/);
    assert.doesNotMatch(planner, /weekLayoutProps/);
    assert.doesNotMatch(planner, /weekDates\.includes\(e\.suggestedDate\)/);
    assert.doesNotMatch(planner, /import \{ TeacherWeeklyTimetable \}/);
    assert.doesNotMatch(planner, /<TeacherWeeklyTimetable[\s/>]/);
    assert.doesNotMatch(weekly, /إضافة حصة/);
    assert.doesNotMatch(weekly, /TimetableSlotFormDialog/);
  });

  it("loads timetable slots and lesson sessions with local YYYY-MM-DD week dates", () => {
    assert.match(weekly, /useTeacherTimetable/);
    assert.match(hook, /TeacherTimetableService\.getTimetable\(\)/);
    assert.match(weekly, /LessonSessionService\.getSessionsByDates\(weekDates\)/);
    assert.match(weekly, /LessonSessionService\.ensureSessionsForDate\(date\)/);
    assert.match(weekly, /date\.getFullYear\(\)/);
    assert.match(weekly, /date\.getMonth\(\)/);
    assert.match(weekly, /date\.getDate\(\)/);
    assert.doesNotMatch(weekly, /toISOString\(\)\.slice\(0, 10\)/);
    assert.match(
      weekly,
      /session\.dayOfWeek\}-\$\{session\.periodNumber\}/,
    );
    assert.match(weekly, /getEntry\(day\.value, period\)/);
  });

  it("renders mobile/tablet day-tab cards and desktop 5-day HTML table", () => {
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(mobile, /lg:hidden/);
    assert.match(mobile, /TabsTrigger/);
    assert.match(card, /لا توجد حصة/);
    assert.match(card, /LessonSelector/);
    assert.match(card, /LessonActions/);
    assert.match(weekly, /hidden min-w-0 lg:block/);
    assert.match(weekly, /min-w-\[920px\]/);
    assert.match(weekly, /overflow-x-auto/);
    assert.match(weekly, /ar-SA-u-ca-islamic-umalqura/);
    assert.match(weekly, />\s*—\s*</);
  });

  it("keeps product navigation, preparation destinations, and BottomNav التقارير", () => {
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
    assert.match(toolbar, /تحضير اليوم/);
    assert.match(toolbar, /تحضير الأسبوع/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
    assert.match(bottomNav, /التقارير/);
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
