import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORRECTIONS_EMPTY_DESCRIPTION,
  CORRECTIONS_EMPTY_TITLE,
  CORRECTIONS_ERROR_TITLE,
} from "./corrections-inbox.logic.ts";

describe("TASK 23 corrections UI/routing contracts", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  it("12-18. labels, deep links, empty/error, no teacher_id, grading→corrections", () => {
    assert.match(CORRECTIONS_EMPTY_TITLE, /لا توجد تسليمات/);
    assert.match(CORRECTIONS_EMPTY_DESCRIPTION, /واجب أو اختبار/);
    assert.match(CORRECTIONS_ERROR_TITLE, /تعذر تحميل/);

    const page = readFileSync(
      path.join(here, "../components/corrections-page-content.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(here, "../hooks/useCorrectionsInbox.ts"), "utf8");
    const correctionsRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/corrections.tsx"),
      "utf8",
    );
    const gradingRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/grading.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      path.join(here, "../../../components/layout/app-sidebar.tsx"),
      "utf8",
    );
    const bottomNav = readFileSync(
      path.join(here, "../../../components/layout/bottom-nav.tsx"),
      "utf8",
    );

    assert.match(page, /التصحيح/);
    assert.match(page, /يحتاج تصحيحاً/);
    assert.match(page, /فتح للتصحيح/);
    assert.match(page, /CORRECTIONS_EMPTY_TITLE/);
    assert.match(page, /CORRECTIONS_ERROR_TITLE/);
    assert.match(page, /to=["']\/homework["']/);
    assert.match(page, /to=["']\/tests["']/);
    assert.match(page, /homeworkId/);
    assert.match(page, /testId/);
    assert.equal(/قريباً|تكامل النظام المدرسي|بوابة الطالب/.test(page), false);
    assert.equal(/قريباً|تكامل النظام المدرسي/.test(correctionsRoute), false);

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(page), false);
    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(hook), false);

    assert.match(gradingRoute, /redirect/);
    assert.match(gradingRoute, /["']\/corrections["']/);
    assert.match(sidebar, /url:\s*["']\/corrections["']/);
    assert.equal(/url:\s*["']\/grading["']/.test(sidebar), false);
    assert.match(bottomNav, /["']\/corrections["']/);
    assert.match(bottomNav, /["']\/homework["']/);
    assert.match(bottomNav, /["']\/tests["']/);
    assert.match(bottomNav, /التصحيح/);
    assert.match(bottomNav, /grid-cols-7/);
  });
});
