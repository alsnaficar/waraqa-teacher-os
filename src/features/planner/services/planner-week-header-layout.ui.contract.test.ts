import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 25.31 mobile-first week header layout", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const mobile = readSrc(
    "../../teacher-timetable/components/teacher-weekly-timetable-mobile.tsx",
  );
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const toolbar = readSrc("../components/planner-toolbar.tsx");

  const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
  const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
  const header = weekly.slice(headerStart, headerEnd);

  it("keeps date/week information centered above mobile action groups", () => {
    assert.match(header, /order-1 flex min-w-0 w-full flex-col items-center md:order-2/);
    assert.match(header, /flex min-w-0 flex-1 flex-col items-center px-1 text-center/);
    assert.match(header, /الجدول الأسبوعي/);
    assert.match(header, /weekRange\.hijriStart/);
    assert.match(header, /weekRange\.gregorianStart/);
    assert.ok(header.indexOf("md:order-2") < header.indexOf("order-2 grid"));
  });

  it("stacks two equal-width prep groups under the date on mobile, not one three-section row", () => {
    assert.match(
      header,
      /flex min-w-0 w-full max-w-full flex-col gap-3 overflow-x-hidden/,
    );
    assert.match(header, /order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents/);
    assert.match(header, /flex min-w-0 w-full flex-col items-stretch gap-1\.5 md:w-44/);
    assert.doesNotMatch(
      header,
      /flex items-center justify-between gap-2" dir="rtl"/,
    );
  });

  it("uses a three-section desktop/tablet layout: today | date | week", () => {
    assert.match(
      header,
      /md:grid md:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/,
    );
    assert.match(header, /md:order-1 md:justify-self-start/);
    assert.match(header, /md:order-3 md:justify-self-end/);

    const todayIdx = header.indexOf("تحضير اليوم");
    const weekIdx = header.indexOf("تحضير الأسبوع");
    const dateOrderIdx = header.indexOf("md:order-2");
    assert.ok(todayIdx !== -1 && weekIdx !== -1 && dateOrderIdx !== -1);
    assert.ok(todayIdx < weekIdx);
  });

  it("keeps existing prep destinations, icons, grouped deletes, and tappable buttons", () => {
    assert.match(header, /to=["']\/lesson-sessions["']/);
    assert.match(header, /to=["']\/weekly-preparation["']/);
    assert.match(header, /onComingSoon\("حذف اليوم"\)/);
    assert.match(header, /onComingSoon\("حذف الأسبوع"\)/);
    assert.match(header, /Sparkles/);
    assert.match(header, /Trash2/);
    assert.match(header, /h-11 min-h-\[44px\] w-full min-w-0/);
    assert.match(header, /whitespace-normal/);
    assert.doesNotMatch(header, /w-\[3(2|6)0px\]/);
    assert.doesNotMatch(header, /min-w-\[(320|360|390|430)px\]/);
  });

  it("does not duplicate prep buttons in top planner nav or change Family C timetable cards", () => {
    const top = planner.slice(
      planner.indexOf("الخطة والجدول الدراسي"),
      planner.indexOf('view === "semester"'),
    );
    assert.doesNotMatch(top, /تحضير اليوم/);
    assert.doesNotMatch(top, /تحضير الأسبوع/);
    assert.match(toolbar, /to=["']\/lesson-sessions["']/);
    assert.match(toolbar, /to=["']\/weekly-preparation["']/);
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(mobile, /lg:hidden/);
    assert.match(weekly, /hidden min-w-0 lg:block/);
    assert.match(weekly, /min-w-\[920px\]/);
    assert.match(weekly, /queryClient\.prefetchQuery/);
    assert.match(weekly, /const weekSwitchPending = existingSessionsQuery\.isPlaceholderData/);
  });
});

describe("TASK 25.32 weekly plan publish UI in Family C header", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const planner = readSrc("../../../routes/_authenticated/planner.tsx");
  const toolbar = readSrc("../components/planner-toolbar.tsx");
  const bottomNav = readSrc("../../../components/layout/bottom-nav.tsx");

  const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
  const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
  const header = weekly.slice(headerStart, headerEnd);
  const publishStart = header.indexOf("{entriesCount} حصص");
  const prepGroupsStart = header.indexOf("order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents");
  const publishBlock = header.slice(publishStart, prepGroupsStart);

  it("places نشر الخطة under the lesson count with both destination labels", () => {
    assert.notEqual(publishStart, -1);
    assert.match(publishBlock, /نشر الخطة/);
    assert.match(publishBlock, /منصة مدرستي/);
    assert.match(publishBlock, /المدير وولي الأمر/);
    assert.doesNotMatch(publishBlock, /PDF|ملف PDF/);
    assert.ok(publishBlock.indexOf("حصص") < publishBlock.indexOf("نشر الخطة"));
    assert.ok(publishBlock.indexOf("نشر الخطة") < publishBlock.indexOf("منصة مدرستي"));
  });

  it("uses School and Users icons and coming-soon toasts without invented routes", () => {
    assert.match(header, /<School className=/);
    assert.match(header, /<Users className=/);
    assert.match(header, /onComingSoon\("منصة مدرستي"\)/);
    assert.match(header, /onComingSoon\("المدير وولي الأمر"\)/);
    assert.doesNotMatch(publishBlock, /to=["']\//);
    assert.doesNotMatch(weekly, /applyMockMadrasatiTimetable/);
    assert.doesNotMatch(weekly, /previewMadrasatiSync/);
    assert.doesNotMatch(weekly, /PublishModal/);
    assert.doesNotMatch(weekly, /تم النشر بنجاح/);
  });

  it("keeps equal-width wrapping publish buttons without 320px overflow widths", () => {
    assert.match(
      publishBlock,
      /grid min-w-0 w-full grid-cols-2 gap-2 sm:gap-3/,
    );
    assert.match(header, /flex min-w-0 w-full max-w-full flex-col gap-3 overflow-x-hidden/);
    assert.match(header, /h-11 min-h-\[44px\] w-full min-w-0/);
    assert.match(header, /whitespace-normal/);
    assert.doesNotMatch(header, /w-\[3(2|6)0px\]/);
    assert.doesNotMatch(header, /min-w-\[(320|360|390|430)px\]/);
  });

  it("does not mount PlannerToolbar publish or restore historical weekly layouts", () => {
    const top = planner.slice(
      planner.indexOf("الخطة والجدول الدراسي"),
      planner.indexOf('view === "semester"'),
    );
    assert.match(planner, /<FilledWeeklyTimetable \/>/);
    assert.doesNotMatch(planner, /PlannerToolbar/);
    assert.doesNotMatch(planner, /PlannerMobileLayout/);
    assert.doesNotMatch(planner, /PlannerDesktopLayout/);
    assert.doesNotMatch(planner, /PublishModal/);
    assert.doesNotMatch(top, /نشر الخطة/);
    assert.doesNotMatch(top, /منصة مدرستي/);
    assert.match(toolbar, /نشر الخطة/);
    assert.match(bottomNav, /التقارير/);
    assert.match(header, /order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents/);
    assert.match(
      header,
      /md:grid md:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/,
    );
  });
});
