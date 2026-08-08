/**
 * Pure-logic security proof for P3 Step 2 F1 RLS (no DB writes).
 *
 * Mirrors the WITH CHECK / USING predicates in:
 * supabase/migrations/20260808000400_ai_generations_lesson_session_binding.sql
 *
 * Run: npx tsx --test src/features/ai/services/ai-generations-rls-binding.logic.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const TEACHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

type Session = { id: string; teacher_id: string };
type Generation = { user_id: string; lesson_session_id: string | null };

const sessions: Session[] = [
  { id: SESSION_A, teacher_id: TEACHER_A },
  { id: SESSION_B, teacher_id: TEACHER_B },
];

function ownedSessionExists(lessonSessionId: string | null, authUid: string): boolean {
  if (lessonSessionId == null) return false;
  return sessions.some((s) => s.id === lessonSessionId && s.teacher_id === authUid);
}

/** INSERT WITH CHECK */
function insertAllowed(row: Generation, authUid: string): boolean {
  return (
    authUid === row.user_id &&
    row.lesson_session_id != null &&
    ownedSessionExists(row.lesson_session_id, authUid)
  );
}

/** UPDATE: USING(old) AND WITH CHECK(new) */
function updateAllowed(oldRow: Generation, newRow: Generation, authUid: string): boolean {
  const usingOk = authUid === oldRow.user_id;
  const withCheckOk =
    authUid === newRow.user_id &&
    (newRow.lesson_session_id == null || ownedSessionExists(newRow.lesson_session_id, authUid));
  return usingOk && withCheckOk;
}

/** SELECT / DELETE USING */
function selectOrDeleteAllowed(row: Generation, authUid: string): boolean {
  return authUid === row.user_id;
}

describe("P3 Step 2 F1 RLS logic (ai_generations)", () => {
  it("A. Teacher B insert user_id=B session=A → DENIED", () => {
    assert.equal(
      insertAllowed({ user_id: TEACHER_B, lesson_session_id: SESSION_A }, TEACHER_B),
      false,
    );
  });

  it("B. Teacher B update own gen lesson_session_id=A → DENIED", () => {
    const oldRow = { user_id: TEACHER_B, lesson_session_id: SESSION_B };
    const newRow = { user_id: TEACHER_B, lesson_session_id: SESSION_A };
    assert.equal(updateAllowed(oldRow, newRow, TEACHER_B), false);
  });

  it("C. Teacher B insert user_id=B session=NULL → DENIED", () => {
    assert.equal(insertAllowed({ user_id: TEACHER_B, lesson_session_id: null }, TEACHER_B), false);
  });

  it("D. Teacher B insert user_id=A session=A → DENIED", () => {
    assert.equal(
      insertAllowed({ user_id: TEACHER_A, lesson_session_id: SESSION_A }, TEACHER_B),
      false,
    );
  });

  it("E. Teacher B insert user_id=B session=B → ALLOWED", () => {
    assert.equal(
      insertAllowed({ user_id: TEACHER_B, lesson_session_id: SESSION_B }, TEACHER_B),
      true,
    );
  });

  it("F. Teacher B select Teacher A generation → DENIED", () => {
    assert.equal(
      selectOrDeleteAllowed({ user_id: TEACHER_A, lesson_session_id: SESSION_A }, TEACHER_B),
      false,
    );
  });

  it("G. Teacher B delete Teacher A generation → DENIED", () => {
    assert.equal(
      selectOrDeleteAllowed({ user_id: TEACHER_A, lesson_session_id: SESSION_A }, TEACHER_B),
      false,
    );
  });

  it("Historical. Teacher B NULL session: SELECT ok, UPDATE keep NULL ok, no forced backfill", () => {
    const historical = { user_id: TEACHER_B, lesson_session_id: null as string | null };
    assert.equal(selectOrDeleteAllowed(historical, TEACHER_B), true);
    assert.equal(
      updateAllowed(historical, { user_id: TEACHER_B, lesson_session_id: null }, TEACHER_B),
      true,
    );
    // Rebind to owned session is allowed on UPDATE
    assert.equal(
      updateAllowed(historical, { user_id: TEACHER_B, lesson_session_id: SESSION_B }, TEACHER_B),
      true,
    );
    // INSERT of NULL still denied (new product rows)
    assert.equal(insertAllowed(historical, TEACHER_B), false);
  });
});
