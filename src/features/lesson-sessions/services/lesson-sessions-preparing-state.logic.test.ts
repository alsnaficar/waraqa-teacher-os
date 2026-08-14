/**
 * Pure-logic mirror of:
 * public.lesson_sessions_enforce_preparing_state()
 * in supabase/migrations/20260808000500_lesson_sessions_preparing_status.sql
 *
 * No live DB harness exists for lesson_sessions triggers in this repo;
 * these predicates document and lock the approved F1/F2 contract.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type SessionRow = {
  id: string;
  teacher_id: string;
  academic_year_id: string;
  semester_id: string;
  grade_id: string | null;
  class_id: string | null;
  curriculum_lesson_id: string;
  curriculum_lesson_source: "plan" | "manual";
  session_date: string;
  day_of_week: number;
  period_number: number;
  lesson_locked: boolean;
  status: string;
  prepared_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function identityFrozen(oldRow: SessionRow, newRow: SessionRow): boolean {
  return !(
    newRow.id !== oldRow.id ||
    newRow.teacher_id !== oldRow.teacher_id ||
    newRow.academic_year_id !== oldRow.academic_year_id ||
    newRow.semester_id !== oldRow.semester_id ||
    newRow.grade_id !== oldRow.grade_id ||
    newRow.class_id !== oldRow.class_id ||
    newRow.curriculum_lesson_id !== oldRow.curriculum_lesson_id ||
    newRow.curriculum_lesson_source !== oldRow.curriculum_lesson_source ||
    newRow.session_date !== oldRow.session_date ||
    newRow.day_of_week !== oldRow.day_of_week ||
    newRow.period_number !== oldRow.period_number ||
    newRow.created_at !== oldRow.created_at
  );
}

/** Mirrors the BEFORE UPDATE trigger when OLD.status = preparing. */
function enforcePreparingUpdate(oldRow: SessionRow, newRow: SessionRow): "ok" | string {
  if (oldRow.status !== "preparing") return "ok";

  if (!identityFrozen(oldRow, newRow)) {
    return "identity/context immutable";
  }

  if (newRow.status === "prepared") {
    if (newRow.lesson_locked !== true) return "prepared requires lesson_locked";
    if (newRow.prepared_at == null) return "prepared requires prepared_at";
    return "ok";
  }

  if (newRow.status === "scheduled") {
    if (newRow.lesson_locked !== false) return "scheduled requires unlocked";
    if (newRow.prepared_at != null) return "scheduled requires prepared_at null";
    if (newRow.completed_at !== oldRow.completed_at) return "completed_at must not change";
    return "ok";
  }

  return `status transition preparing → ${newRow.status} denied`;
}

function basePreparing(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    teacher_id: "11111111-1111-4111-8111-111111111111",
    academic_year_id: "yyyyyyyy-yyyy-4yyy-8yyy-yyyyyyyyyyyy",
    semester_id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
    grade_id: null,
    class_id: null,
    curriculum_lesson_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    curriculum_lesson_source: "plan",
    session_date: "2026-08-08",
    day_of_week: 5,
    period_number: 1,
    lesson_locked: false,
    status: "preparing",
    prepared_at: null,
    completed_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("P3 Step 4 preparing-state DB contract (logic mirror)", () => {
  it("A. preparing → prepared allowed", () => {
    const oldRow = basePreparing();
    const next = {
      ...oldRow,
      status: "prepared",
      lesson_locked: true,
      prepared_at: "2026-08-08T12:00:00Z",
      updated_at: "2026-08-08T12:00:01Z",
    };
    assert.equal(enforcePreparingUpdate(oldRow, next), "ok");
  });

  it("B. preparing → scheduled allowed", () => {
    const oldRow = basePreparing();
    const next = {
      ...oldRow,
      status: "scheduled",
      lesson_locked: false,
      prepared_at: null,
      updated_at: "2026-08-08T12:00:01Z",
    };
    assert.equal(enforcePreparingUpdate(oldRow, next), "ok");
  });

  it("C. preparing → completed denied", () => {
    const oldRow = basePreparing();
    assert.match(
      enforcePreparingUpdate(oldRow, { ...oldRow, status: "completed" }),
      /denied|completed/,
    );
  });

  it("D. preparing → cancelled denied", () => {
    const oldRow = basePreparing();
    assert.match(
      enforcePreparingUpdate(oldRow, { ...oldRow, status: "cancelled" }),
      /denied|cancelled/,
    );
  });

  it("E. preparing → curriculum change denied", () => {
    const oldRow = basePreparing();
    assert.equal(
      enforcePreparingUpdate(oldRow, {
        ...oldRow,
        curriculum_lesson_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
      "identity/context immutable",
    );
  });

  it("E2. preparing → curriculum_lesson_source change denied", () => {
    const oldRow = basePreparing();
    assert.equal(
      enforcePreparingUpdate(oldRow, {
        ...oldRow,
        curriculum_lesson_source: "manual",
      }),
      "identity/context immutable",
    );
  });

  it("F. preparing → teacher change denied", () => {
    const oldRow = basePreparing();
    assert.equal(
      enforcePreparingUpdate(oldRow, {
        ...oldRow,
        teacher_id: "22222222-2222-4222-8222-222222222222",
      }),
      "identity/context immutable",
    );
  });

  it("G. preparing → session identity change denied", () => {
    const oldRow = basePreparing();
    assert.equal(
      enforcePreparingUpdate(oldRow, { ...oldRow, period_number: 9 }),
      "identity/context immutable",
    );
    assert.equal(
      enforcePreparingUpdate(oldRow, { ...oldRow, session_date: "2026-08-09" }),
      "identity/context immutable",
    );
  });

  it("owner-style PostgREST mutations while preparing are denied by contract", () => {
    const oldRow = basePreparing();
    assert.equal(
      enforcePreparingUpdate(oldRow, {
        ...oldRow,
        curriculum_lesson_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        status: "preparing",
      }),
      "identity/context immutable",
    );
    assert.match(
      enforcePreparingUpdate(oldRow, { ...oldRow, status: "completed" }),
      /denied|completed/,
    );
    assert.match(
      enforcePreparingUpdate(oldRow, { ...oldRow, status: "cancelled" }),
      /denied|cancelled/,
    );
    assert.equal(
      enforcePreparingUpdate(oldRow, {
        ...oldRow,
        teacher_id: "33333333-3333-4333-8333-333333333333",
      }),
      "identity/context immutable",
    );
  });
});
