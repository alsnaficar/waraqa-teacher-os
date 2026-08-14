import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

function readSrc(relativeFromThisFile: string): string {
  return readFileSync(path.join(here, relativeFromThisFile), "utf8");
}

describe("TASK 21.3-B weekly preparation contract", () => {
  const routePath = path.join(repoRoot, "src/routes/_authenticated/weekly-preparation.tsx");
  const route = readSrc("../../../routes/_authenticated/weekly-preparation.tsx");
  const hook = readSrc("../hooks/useWeeklyLessonSessions.ts");
  const card = readSrc("../components/lesson-session-card.tsx");
  const dialog = readSrc("../components/delete-preparation-dialog.tsx");
  const dailyPage = readSrc("../../../routes/_authenticated/lesson-sessions.tsx");

  it("1–2. weekly route exists at /weekly-preparation", () => {
    assert.equal(existsSync(routePath), true);
    assert.match(route, /createFileRoute\(\s*"\/_authenticated\/weekly-preparation"\s*\)/);
    assert.match(route, /تحضير الأسبوع/);
  });

  it("3. route does not import planner components", () => {
    assert.doesNotMatch(route, /@\/features\/planner/);
    assert.doesNotMatch(route, /SemesterPlan/);
    assert.doesNotMatch(route, /TeacherWeeklyTimetable/);
  });

  it("4–5. hook uses lesson-sessions date keys + ensureSessionsForDate", () => {
    assert.match(hook, /lessonSessionsQueryKey\(date\)/);
    assert.match(hook, /\["lesson-sessions", date\]|lessonSessionsQueryKey/);
    assert.match(hook, /LessonSessionService\.ensureSessionsForDate\(date\)/);
    assert.match(hook, /useQueries/);
  });

  it("6–7. prepared/scheduled action labels remain on LessonSessionCard", () => {
    assert.match(card, /DELETE_PREPARATION_LABEL\s*=\s*"حذف التحضير"/);
    assert.match(card, /تحضير الدرس/);
    assert.match(card, /canPrepare/);
    assert.match(card, /canDeletePreparation/);
  });

  it("8–9. delete confirmation exists and confirm path uses resetPreparation", () => {
    assert.match(route, /DeletePreparationDialog/);
    assert.match(route, /handleConfirmDelete/);
    assert.match(route, /resetPreparation\.mutate/);
    assert.match(dialog, /onConfirm/);
    assert.doesNotMatch(dialog, /LessonSessionService/);
    assert.doesNotMatch(dialog, /\.from\(/);
  });

  it("10–11. reports + lesson-sessions prefix invalidation after reset", () => {
    assert.match(hook, /\["reports", "lesson-sessions"\]/);
    assert.match(hook, /invalidateQueries\(\{\s*queryKey:\s*\["lesson-sessions"\]/);
    assert.match(hook, /LessonSessionService\.resetPreparation/);
    assert.match(hook, /onSuccess:\s*invalidateAfterReset/);
  });

  it("12. no database delete operation introduced in weekly surface", () => {
    assert.doesNotMatch(route, /\.delete\(/);
    assert.doesNotMatch(hook, /\.delete\(/);
    assert.doesNotMatch(dialog, /\.delete\(/);
    assert.doesNotMatch(route, /\.from\(\s*["']lesson_sessions["']\s*\)/);
    assert.doesNotMatch(route, /\.from\(\s*["']ai_generations["']\s*\)/);
  });

  it("13. no migration introduced for weekly preparation", () => {
    const migrationsDir = path.join(repoRoot, "supabase/migrations");
    if (!existsSync(migrationsDir)) {
      assert.ok(true);
      return;
    }
    const weeklyMigration = readdirSync(migrationsDir).filter((name) =>
      /weekly.?prep|prep.?week/i.test(name),
    );
    assert.deepEqual(weeklyMigration, []);
  });

  it("daily page links to weekly preparation", () => {
    assert.match(dailyPage, /\/weekly-preparation/);
    assert.match(dailyPage, /تحضير الأسبوع/);
  });
});
