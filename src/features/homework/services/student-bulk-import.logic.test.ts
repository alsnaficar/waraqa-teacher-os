import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Student } from "./student.service.ts";
import {
  formatStudentImportSummary,
  normalizeStudentName,
  parseStudentImportText,
  planStudentImport,
  STUDENT_BULK_IMPORT_MAX,
  summarizeStudentImport,
} from "./student-bulk-import.logic.ts";

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    teacherId: "t1",
    fullName: "أحمد محمد",
    classId: "c1",
    gradeId: "g1",
    studentCode: null,
    active: true,
    createdAt: "2026-08-15T00:00:00Z",
    updatedAt: "2026-08-15T00:00:00Z",
    ...overrides,
  };
}

describe("TASK 25.2 student bulk import logic", () => {
  it("13. empty lines ignored; names normalized", () => {
    const { rows } = parseStudentImportText("\n  أحمد   محمد  \n\nخالد علي\n");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.fullName, "أحمد محمد");
    assert.equal(rows[0]?.status, "valid");
    assert.equal(normalizeStudentName("  أحمد   محمد "), "أحمد محمد");
  });

  it("14. invalid rows reported", () => {
    const { rows } = parseStudentImportText("أحمد\n   \n" + "س".repeat(201));
    // empty line skipped entirely; long name invalid
    const invalid = rows.filter((row) => row.status === "invalid");
    assert.ok(invalid.length >= 1);
    assert.match(invalid[0]?.reason ?? "", /طويل/);
  });

  it("15. duplicate rows in same batch handled", () => {
    const { rows } = parseStudentImportText("أحمد محمد\nأحمد محمد\nخالد علي");
    assert.equal(rows.filter((row) => row.status === "valid").length, 2);
    assert.equal(rows.filter((row) => row.status === "batch_duplicate").length, 1);
  });

  it("supports optional code via comma or tab", () => {
    const comma = parseStudentImportText("أحمد,S01");
    assert.equal(comma.rows[0]?.studentCode, "S01");
    const tab = parseStudentImportText("خالد\tS02");
    assert.equal(tab.rows[0]?.studentCode, "S02");
  });

  it("16. existing same-class name → already exists; other class allowed", () => {
    const parsed = parseStudentImportText("أحمد محمد\nسعد عبدالله").rows;
    const plan = planStudentImport(parsed, [student({ fullName: "أحمد محمد", classId: "c1" })]);
    assert.equal(plan.alreadyExistsCount, 1);
    assert.equal(plan.createCount, 1);
    assert.equal(
      plan.items.find((item) => item.fullName === "أحمد محمد")?.action,
      "skip_already_exists",
    );
  });

  it("truncates beyond STUDENT_BULK_IMPORT_MAX valid names", () => {
    const lines = Array.from({ length: STUDENT_BULK_IMPORT_MAX + 5 }, (_, i) => `طالب ${i}`);
    const { rows, truncated } = parseStudentImportText(lines.join("\n"));
    assert.equal(truncated, true);
    assert.equal(rows.filter((row) => row.status === "valid").length, STUDENT_BULK_IMPORT_MAX);
  });

  it("summary formatting", () => {
    const parsed = parseStudentImportText("أ\nأ\n").rows;
    const plan = planStudentImport(parsed, []);
    const summary = summarizeStudentImport(plan, 1);
    assert.equal(summary.added, 1);
    assert.equal(summary.skippedDuplicate, 1);
    assert.match(formatStudentImportSummary(summary), /تمت إضافة 1/);
  });
});
