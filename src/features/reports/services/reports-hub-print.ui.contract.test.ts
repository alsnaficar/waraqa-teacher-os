import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TASK 25.10 reports hub print contracts", () => {
  it("reports page wires print button and print document from snapshot", () => {
    const page = readFileSync(path.join(here, "../components/reports-page-content.tsx"), "utf8");
    const printDoc = readFileSync(path.join(here, "../components/reports-hub-print.tsx"), "utf8");

    assert.match(page, /REPORTS_HUB_PRINT_BUTTON_LABEL|طباعة التقرير/);
    assert.match(page, /buildReportsHubPrintView/);
    assert.match(page, /ReportsHubPrintDocument/);
    assert.match(page, /window\.print/);
    assert.doesNotMatch(page, /HomeworkReportsPanel|TestReportsPanel/);
    assert.doesNotMatch(page, /teacher_id\s*[:=]/);
    assert.doesNotMatch(page, /supabase\.from/);

    assert.match(printDoc, /REPORTS_HUB_PRINT_ROOT_ID|reports-hub-print/);
    assert.match(printDoc, /dir="rtl"/);
    assert.doesNotMatch(printDoc, /supabase|teacher_id\s*[:=]/);
    assert.doesNotMatch(printDoc, /ReportsHubService|getSnapshot|getPeriodReport/);
  });

  it("print CSS allows reports hub and preserves semester-plan print", () => {
    const css = readFileSync(path.join(here, "../../../styles.css"), "utf8");
    assert.match(css, /@media print/);
    assert.match(css, /#semester-plan-print/);
    assert.match(css, /#reports-hub-print/);
    assert.match(css, /size:\s*A4/);
  });
});
