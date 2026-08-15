import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.8 DashboardReports UI contract", () => {
  it("shows three summaries and /reports CTA; no detail tables or supabase", () => {
    const source = readFileSync(path.join(here, "dashboard-reports.tsx"), "utf8");
    assert.match(source, /REPORTS_HUB_LESSONS_TITLE|ملخص الحصص/);
    assert.match(source, /REPORTS_HUB_HOMEWORK_TITLE|ملخص الواجبات/);
    assert.match(source, /REPORTS_HUB_TESTS_TITLE|ملخص الاختبارات/);
    assert.match(source, /REPORTS_HUB_VIEW_ALL_CTA|عرض جميع التقارير/);
    assert.match(source, /to=["']\/reports["']/);
    assert.doesNotMatch(source, /HomeworkReportsPanel|TestReportsPanel/);
    assert.doesNotMatch(source, /<table|StudentPerformance|students\.map/);
    assert.doesNotMatch(source, /teacher_id\s*[:=]/);
    assert.doesNotMatch(source, /supabase\.from|createClient/);
  });

  it("dashboard route wires shared useReportsHub and keeps existing sections", () => {
    const dashboard = readFileSync(
      path.join(here, "../../routes/_authenticated/dashboard.tsx"),
      "utf8",
    );
    assert.match(dashboard, /useReportsHub/);
    assert.match(dashboard, /DashboardReports/);
    assert.match(dashboard, /PendingTasks/);
    assert.match(dashboard, /DashboardNotifications/);
    assert.match(dashboard, /TodayLessonsSection/);
    assert.match(dashboard, /QuickActions/);
    assert.doesNotMatch(dashboard, /teacher_id\s*[:=]/);
  });
});
