import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";

import { enrichReportWithLessonTitles } from "./enrich-report-with-lesson-titles.ts";
import type { LessonSessionReport } from "./reports.service.ts";
import {
  assertNoClientTeacherId,
  buildReportSummaryItems,
  buildReportsDateFilter,
  REPORT_STATUS_LABELS,
  REPORTS_EMPTY_TITLE,
  REPORTS_ERROR_TITLE,
  REPORTS_FILTER_OPTIONS,
  reportLockLabel,
} from "./reports-ui.logic.ts";

const TEACHER_A = "11111111-1111-4111-8111-111111111111";

describe("TASK 19.4 reports UI filter contract", () => {
  it("1. today filter", () => {
    const filter = buildReportsDateFilter("today");
    assert.deepEqual(filter, { kind: "today" });
    assertNoClientTeacherId(filter);
  });

  it("2. week filter", () => {
    const filter = buildReportsDateFilter("week");
    assert.deepEqual(filter, { kind: "week" });
    assertNoClientTeacherId(filter);
  });

  it("3. month filter", () => {
    const filter = buildReportsDateFilter("month");
    assert.deepEqual(filter, { kind: "month" });
    assertNoClientTeacherId(filter);
  });

  it("4. custom filter", () => {
    const filter = buildReportsDateFilter("custom", {
      from: "2026-08-01",
      to: "2026-08-14",
    });
    assert.deepEqual(filter, {
      kind: "custom",
      from: "2026-08-01",
      to: "2026-08-14",
    });
    assertNoClientTeacherId(filter);
  });

  it("custom filter rejects inverted range", () => {
    assert.throws(
      () => buildReportsDateFilter("custom", { from: "2026-08-14", to: "2026-08-01" }),
      /تاريخ البداية/,
    );
  });
});

describe("TASK 19.4 reports UI summary + Arabic labels", () => {
  it("5. summary values render from stats", () => {
    const items = buildReportSummaryItems({
      total: 10,
      scheduled: 2,
      preparing: 1,
      prepared: 3,
      completed: 3,
      cancelled: 1,
      completionRate: 30,
    });

    assert.equal(items.length, 7);
    assert.equal(items[0]?.label, "إجمالي الحصص");
    assert.equal(items[0]?.value, "10");
    assert.equal(items[1]?.label, "مجدولة");
    assert.equal(items[2]?.label, "قيد الإعداد");
    assert.equal(items[3]?.label, "معدة");
    assert.equal(items[4]?.label, "مكتملة");
    assert.equal(items[4]?.value, "3");
    assert.equal(items[5]?.label, "ملغاة");
    assert.equal(items[6]?.label, "نسبة الإنجاز");
    assert.equal(items[6]?.value, "30%");
  });

  it("6. empty state Arabic copy", () => {
    assert.match(REPORTS_EMPTY_TITLE, /لا توجد حصص/);
    assert.match(REPORTS_EMPTY_TITLE, /الفترة/);
  });

  it("7. error state Arabic copy", () => {
    assert.match(REPORTS_ERROR_TITLE, /تعذر تحميل التقرير/);
  });

  it("8. Arabic status labels cover all five statuses", () => {
    assert.equal(REPORT_STATUS_LABELS.scheduled, "مجدولة");
    assert.equal(REPORT_STATUS_LABELS.preparing, "قيد الإعداد");
    assert.equal(REPORT_STATUS_LABELS.prepared, "معدة");
    assert.equal(REPORT_STATUS_LABELS.completed, "مكتملة");
    assert.equal(REPORT_STATUS_LABELS.cancelled, "ملغاة");
    assert.equal(reportLockLabel(true), "مقفلة");
    assert.equal(reportLockLabel(false), "غير مقفلة");
  });

  it("filter option labels are Arabic presets", () => {
    assert.deepEqual(
      REPORTS_FILTER_OPTIONS.map((option) => option.label),
      ["اليوم", "هذا الأسبوع", "هذا الشهر", "فترة مخصصة"],
    );
  });
});

describe("TASK 19.4 security — no client teacher_id override", () => {
  it("9. UI builders and page sources never accept teacher_id", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      path.join(here, "../hooks/useLessonSessionReport.ts"),
      path.join(here, "../hooks/useReportsHub.ts"),
      path.join(here, "../components/reports-page-content.tsx"),
      path.join(here, "../../../routes/_authenticated/reports.tsx"),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        /\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(source),
        false,
        `${path.basename(file)} must not set/pass teacher_id`,
      );
      assert.equal(
        /getLessonSessionReport\([^)]*teacher/i.test(source),
        false,
        `${path.basename(file)} must not pass teacher into ReportsService`,
      );
    }

    const filter = buildReportsDateFilter("week");
    assert.equal("teacher_id" in filter, false);
    assert.equal("teacherId" in filter, false);
    assertNoClientTeacherId(filter);
  });
});

describe("TASK 19.4 lesson title enrichment (read-only)", () => {
  it("maps curriculum titles for report sessions without teacher_id arg", async () => {
    const report: LessonSessionReport = {
      range: { from: "2026-08-14", to: "2026-08-14" },
      stats: {
        total: 1,
        scheduled: 1,
        preparing: 0,
        prepared: 0,
        completed: 0,
        cancelled: 0,
        completionRate: 0,
      },
      sessions: [
        {
          id: "s1",
          sessionDate: "2026-08-14",
          dayOfWeek: 5,
          periodNumber: 1,
          status: "scheduled",
          lessonLocked: false,
          curriculumLessonId: "lesson-1",
          teacherId: TEACHER_A,
        },
      ],
    };

    const client = {
      from(table: string) {
        assert.equal(table, "curriculum_lessons");
        const chain = {
          select() {
            return chain;
          },
          in(column: string, ids: string[]) {
            assert.equal(column, "id");
            assert.deepEqual(ids, ["lesson-1"]);
            return Promise.resolve({
              data: [{ id: "lesson-1", title: "الميزان الصرفي" }],
              error: null,
            });
          },
        };
        return chain;
      },
    };

    const auth: SupabaseUserContext = { client: client as never, userId: TEACHER_A };
    const view = await enrichReportWithLessonTitles(report, auth);

    assert.equal(view.sessions[0]?.lessonTitle, "الميزان الصرفي");
    assert.equal(view.stats.total, 1);
  });
});
