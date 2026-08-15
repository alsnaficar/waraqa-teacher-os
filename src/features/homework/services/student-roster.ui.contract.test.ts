import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("TASK 25.2 student roster UI contracts", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  it("panel exposes grade→class filters, bulk paste, activate; no teacher_id writes", () => {
    const panel = readFileSync(
      path.join(here, "../components/students-panel.tsx"),
      "utf8",
    );
    const bulk = readFileSync(
      path.join(here, "../components/student-bulk-import-dialog.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      path.join(here, "../../../routes/_authenticated/settings.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(here, "../hooks/useStudents.ts"), "utf8");

    assert.match(panel, /gradeFilter/);
    assert.match(panel, /لصق قائمة/);
    assert.match(panel, /StudentBulkImportDialog/);
    assert.match(panel, /إيقاف|تفعيل/);
    assert.match(bulk, /parseStudentImportText|planStudentImport/);
    assert.match(settings, /StudentsPanel/);
    assert.match(hook, /bulkCreate/);
    assert.match(hook, /StudentService\.bulkCreate/);

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(panel), false);
    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(bulk), false);
    assert.equal(/from\(["']students["']\)/.test(panel), false);
    assert.equal(/from\(["']students["']\)/.test(bulk), false);
    assert.equal(/from\(["']students["']\)/.test(hook), false);
  });
});
