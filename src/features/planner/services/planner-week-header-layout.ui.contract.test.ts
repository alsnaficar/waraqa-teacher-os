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
      /flex min-w-0 w-full max-w-full flex-col gap-2 overflow-x-hidden/,
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
      /grid min-w-0 w-full grid-cols-2 items-stretch/,
    );
    assert.match(header, /flex min-w-0 w-full max-w-full flex-col gap-2 overflow-x-hidden/);
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

describe("TASK 25.33 weekly header attendance selector", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const lessonPlan = readSrc("../../../routes/_authenticated/ai-lesson-plan.tsx");

  const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
  const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
  const header = weekly.slice(headerStart, headerEnd);
  const publishStart = header.indexOf("نشر الخطة");
  const prepGroupsStart = header.indexOf("order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents");
  const attendanceBlock = header.slice(publishStart, prepGroupsStart);

  it("places حضوري / عن بعد under the publish buttons with in_person default", () => {
    assert.match(header, /useState<"in_person" \| "remote">\("in_person"\)/);
    assert.match(attendanceBlock, /نشر الخطة/);
    assert.match(attendanceBlock, /منصة مدرستي/);
    assert.match(attendanceBlock, /المدير وولي الأمر/);
    assert.match(attendanceBlock, /aria-label="نمط الحضور"/);
    assert.ok(attendanceBlock.indexOf("المدير وولي الأمر") < attendanceBlock.indexOf("حضوري"));
    assert.ok(attendanceBlock.indexOf("حضوري") < attendanceBlock.indexOf("عن بعد"));
    assert.match(attendanceBlock, /value="in_person"/);
    assert.match(attendanceBlock, /value="remote"/);
  });

  it("keeps each radio circle before its Arabic label and حضوري on the RTL right", () => {
    assert.match(attendanceBlock, /dir="rtl"/);
    const inPerson = attendanceBlock.slice(
      attendanceBlock.indexOf("weekly-attendance-in-person"),
      attendanceBlock.indexOf("weekly-attendance-remote"),
    );
    const remote = attendanceBlock.slice(attendanceBlock.indexOf("weekly-attendance-remote"));
    assert.match(inPerson, /dir="ltr"/);
    assert.match(remote, /dir="ltr"/);
    assert.match(inPerson, /min-h-\[44px\] min-w-0/);
    assert.match(remote, /min-h-\[44px\] min-w-0/);
    assert.ok(inPerson.indexOf("<RadioGroupItem") < inPerson.indexOf("حضوري"));
    assert.ok(remote.indexOf("<RadioGroupItem") < remote.indexOf("عن بعد"));
    assert.doesNotMatch(inPerson, /حضوري[\s\S]*<RadioGroupItem/);
    assert.doesNotMatch(remote, /عن بعد[\s\S]*<RadioGroupItem/);
    assert.match(attendanceBlock, /grid min-w-0 w-full grid-cols-2 items-stretch gap-0/);
    assert.doesNotMatch(attendanceBlock, /flex-row-reverse/);
    assert.doesNotMatch(header, /w-\[3(2|6)0px\]/);
  });

  it("keeps attendance local-only and does not change lesson-plan or Family C data paths", () => {
    assert.doesNotMatch(lessonPlan, /حضوري|عن بعد|in_person|deliveryMode/);
    assert.doesNotMatch(lessonPlan, /RadioGroup/);
    assert.doesNotMatch(weekly, /teacher_timetable/);
    assert.doesNotMatch(
      header,
      /LessonSessionService\.(getSessionsByDates|ensureSessionsForDate)/,
    );
    assert.doesNotMatch(header, /\.insert\(|\.update\(|\.upsert\(/);
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(weekly, /queryClient\.prefetchQuery/);
    assert.match(weekly, /const weekSwitchPending = existingSessionsQuery\.isPlaceholderData/);
  });
});

describe("TASK 25.34 weekly header publish/attendance alignment", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
  const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
  const header = weekly.slice(headerStart, headerEnd);
  const countIdx = header.indexOf("{entriesCount} حصص");
  const publishIdx = header.indexOf("نشر الخطة");
  const attendanceIdx = header.indexOf('aria-label="نمط الحضور"');
  const prepIdx = header.indexOf("order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents");
  const block = header.slice(publishIdx, prepIdx);

  it("keeps one centered publish block under the lesson count", () => {
    assert.ok(countIdx !== -1 && publishIdx !== -1 && attendanceIdx !== -1);
    assert.ok(countIdx < publishIdx && publishIdx < attendanceIdx && attendanceIdx < prepIdx);
    assert.match(header, /flex w-full min-w-0 max-w-\[21rem\] flex-col items-center/);
    assert.match(block, /overflow-hidden rounded-xl border border-border\/70/);
    assert.match(
      header,
      /order-1 flex min-w-0 w-full flex-col items-center md:order-2/,
    );
  });

  it("aligns equal publish columns above equal attendance columns with a divider", () => {
    assert.match(block, /grid min-w-0 w-full grid-cols-2 items-stretch/);
    assert.match(block, /border-t border-border\/70/);
    assert.match(block, /border-s border-border\/70/);
    assert.match(block, /منصة مدرستي/);
    assert.match(block, /المدير وولي الأمر/);
    assert.ok(block.indexOf("منصة مدرستي") < block.indexOf("المدير وولي الأمر"));
    assert.ok(block.indexOf("المدير وولي الأمر") < block.indexOf("حضوري"));
    assert.ok(block.indexOf("حضوري") < block.indexOf("عن بعد"));
  });

  it("keeps RTL radio-before-label order, in_person default, and exclusive RadioGroup", () => {
    assert.match(header, /useState<"in_person" \| "remote">\("in_person"\)/);
    assert.match(block, /value=\{attendanceMode\}/);
    assert.match(block, /setAttendanceMode\(value === "remote" \? "remote" : "in_person"\)/);
    assert.match(block, /<School className=/);
    assert.match(block, /<Users className=/);
    assert.match(block, /border-teal-600 text-teal-700/);
    const inPerson = block.slice(
      block.indexOf("weekly-attendance-in-person"),
      block.indexOf("weekly-attendance-remote"),
    );
    const remote = block.slice(block.indexOf("weekly-attendance-remote"));
    assert.match(inPerson, /dir="ltr"/);
    assert.match(remote, /dir="ltr"/);
    assert.ok(inPerson.indexOf("<RadioGroupItem") < inPerson.indexOf("حضوري"));
    assert.ok(remote.indexOf("<RadioGroupItem") < remote.indexOf("عن بعد"));
    assert.doesNotMatch(header, /w-\[3(2|6)0px\]/);
    assert.doesNotMatch(header, /min-w-\[(320|360|390|430)px\]/);
    assert.match(header, /overflow-x-hidden/);
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(weekly, /queryClient\.prefetchQuery/);
    assert.doesNotMatch(weekly, /PublishModal/);
  });
});

describe("TASK 25.37 mobile week header compaction", () => {
  const weekly = readSrc("../components/filled-weekly-timetable.tsx");
  const headerStart = weekly.indexOf("const weekHeaderActionBtnClass");
  const headerEnd = weekly.indexOf("export function FilledWeeklyTimetable");
  const header = weekly.slice(headerStart, headerEnd);
  const legendStart = weekly.indexOf("function PlannerLegend");
  const legend = weekly.slice(legendStart, weekly.indexOf("const weekHeaderActionBtnClass"));
  const titleBlock = header.slice(
    header.indexOf("<CardTitle"),
    header.indexOf("</CardTitle>"),
  );

  it("compacts mobile header padding and gaps without changing md+ structure", () => {
    assert.match(
      weekly,
      /CardHeader className="min-w-0 overflow-x-hidden border-b bg-muted\/30 px-3 py-2 sm:px-4 md:p-6"/,
    );
    assert.match(
      header,
      /flex min-w-0 w-full max-w-full flex-col gap-2 overflow-x-hidden md:grid md:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\] md:items-center md:gap-4/,
    );
    assert.match(header, /mt-2 flex w-full min-w-0 max-w-full flex-col items-center md:mt-3/);
    assert.match(
      header,
      /mt-1 w-full min-w-0 overflow-hidden rounded-xl border border-border\/70 md:mt-1\.5/,
    );
    assert.doesNotMatch(weekly, /px-3 py-3 sm:px-4 md:p-6/);
  });

  it("places the lesson count on the title row and removes the separate count row", () => {
    assert.match(titleBlock, /الجدول الأسبوعي/);
    assert.match(titleBlock, /\{entriesCount\} حصص/);
    assert.match(titleBlock, /aria-label="جاري تحميل الأسبوع"/);
    assert.ok(titleBlock.indexOf("الجدول الأسبوعي") < titleBlock.indexOf("{entriesCount} حصص"));
    assert.ok(titleBlock.indexOf("{entriesCount} حصص") < titleBlock.indexOf("weekRange.hijriStart"));
    assert.doesNotMatch(
      header,
      /mt-2 flex flex-wrap items-center justify-center gap-2/,
    );
  });

  it("keeps publish, attendance, prep groups, and 44px targets", () => {
    assert.match(header, /نشر الخطة/);
    assert.match(header, /منصة مدرستي/);
    assert.match(header, /المدير وولي الأمر/);
    assert.match(header, /useState<"in_person" \| "remote">\("in_person"\)/);
    assert.match(header, /aria-label="نمط الحضور"/);
    assert.ok(header.indexOf("حضوري") < header.indexOf("عن بعد"));
    assert.match(header, /to=["']\/lesson-sessions["']/);
    assert.match(header, /to=["']\/weekly-preparation["']/);
    assert.match(header, /onComingSoon\("حذف اليوم"\)/);
    assert.match(header, /onComingSoon\("حذف الأسبوع"\)/);
    assert.match(header, /order-2 grid min-w-0 w-full grid-cols-2 gap-3 md:contents/);
    assert.match(header, /h-11 min-h-\[44px\] w-full min-w-0/);
    assert.match(header, /min-h-\[44px\] min-w-\[44px\] w-11/);
  });

  it("compacts the mobile legend with internal scroll and keeps every item", () => {
    assert.match(legend, /overflow-x-auto/);
    assert.match(legend, /md:overflow-visible/);
    assert.match(legend, /flex-nowrap/);
    assert.match(legend, /md:flex-wrap/);
    assert.match(legend, /مفتاح الرموز/);
    assert.match(legend, /تحضير الدرس/);
    assert.match(legend, /واجب/);
    assert.match(legend, /اختبار/);
    assert.match(legend, /النشاط/);
    assert.match(legend, /إثراء/);
    assert.match(legend, /الوسائل/);
    assert.match(legend, /label: "حذف"/);
    assert.match(legend, /whitespace-nowrap/);
  });

  it("does not change Family C data paths or md+ week body", () => {
    assert.match(weekly, /TeacherWeeklyTimetableMobile/);
    assert.match(weekly, /WeeklyLessonOptionsProvider/);
    assert.match(weekly, /placeholderData: keepPreviousData/);
    assert.match(weekly, /queryClient\.prefetchQuery/);
    assert.match(weekly, /hidden min-w-0 lg:block/);
    assert.match(weekly, /min-w-\[920px\]/);
    assert.doesNotMatch(weekly, /w-\[3(2|6)0px\]/);
    assert.doesNotMatch(weekly, /min-w-\[(320|360|390|430)px\]/);
    assert.doesNotMatch(weekly, /PublishModal/);
  });
});
