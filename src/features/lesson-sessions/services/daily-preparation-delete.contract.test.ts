import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 21.2-B daily preparation delete UI contract", () => {
  const card = readSrc("../components/lesson-session-card.tsx");
  const page = readSrc("../../../routes/_authenticated/lesson-sessions.tsx");
  const dialog = readSrc("../components/delete-preparation-dialog.tsx");
  const hook = readSrc("../hooks/useLessonSessions.ts");

  it("1. prepared session action displays حذف التحضير", () => {
    assert.match(card, /DELETE_PREPARATION_LABEL\s*=\s*"حذف التحضير"/);
    assert.match(card, /canDeletePreparation/);
    assert.doesNotMatch(card, /إعادة التحضير/);
  });

  it("2. delete requires confirmation (AlertDialog gate)", () => {
    assert.match(page, /DeletePreparationDialog/);
    assert.match(page, /setDeleteTarget/);
    assert.match(dialog, /DELETE_PREPARATION_DIALOG_TITLE\s*=\s*"حذف التحضير؟"/);
    assert.match(dialog, /AlertDialog/);
    assert.match(dialog, /سيتم حذف التحضير الحالي فقط/);
    assert.match(dialog, /مجدولة/);
    assert.match(dialog, /الجدول/);
    assert.match(dialog, /المنهج/);
    assert.match(dialog, /الواجب المرتبط/);
    assert.match(dialog, /الذكاء الاصطناعي محفوظ/);
    assert.match(page, /status === "prepared"/);
  });

  it("3. confirm invokes resetPreparation (not a bypass API)", () => {
    assert.match(page, /handleConfirmDelete/);
    assert.match(page, /resetPreparation\.mutate/);
    assert.match(dialog, /DELETE_PREPARATION_CONFIRM_LABEL\s*=\s*"حذف التحضير"/);
    assert.match(dialog, /onConfirm/);
    assert.doesNotMatch(dialog, /LessonSessionService/);
    assert.doesNotMatch(dialog, /\.from\(/);
    assert.match(hook, /LessonSessionService\.resetPreparation/);
    assert.doesNotMatch(page, /\.from\(\s*["']lesson_sessions["']\s*\)/);
  });

  it("13. Reports query is invalidated after successful reset", () => {
    assert.match(hook, /\["reports", "lesson-sessions"\]/);
    assert.match(hook, /invalidateAfterReset/);
    assert.match(hook, /onSuccess:\s*invalidateAfterReset/);
  });

  it("14. Dashboard today's session query is refreshed (lesson-sessions prefix)", () => {
    assert.match(hook, /invalidateQueries\(\{\s*queryKey:\s*\["lesson-sessions"\]/);
  });

  it("preparing cancel label stays distinct from delete", () => {
    assert.match(card, /CANCEL_PREPARING_LABEL\s*=\s*"إلغاء التحضير"/);
    assert.match(card, /canCancelPreparing/);
    assert.match(page, /status === "preparing"/);
  });
});
