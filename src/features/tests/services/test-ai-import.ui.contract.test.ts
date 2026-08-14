import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("TASK 22.8 AI quiz → Tests import UI/hook contracts", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  it("26-30. CTA, loading, navigation, no teacher_id / no direct writes", () => {
    const quizRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/ai-quiz.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(here, "../hooks/useTestAiImport.ts"), "utf8");
    const testsRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/tests.tsx"),
      "utf8",
    );

    assert.match(quizRoute, /إنشاء اختبار مسودة/);
    assert.match(quizRoute, /generatedData/);
    assert.match(quizRoute, /generationId/);
    assert.match(quizRoute, /createDraftFromQuizGeneration/);
    assert.match(quizRoute, /importPending/);
    assert.match(quizRoute, /navigate\(\s*\{\s*to:\s*["']\/tests["']/);
    assert.match(quizRoute, /مقالي قصير/);
    assert.match(quizRoute, /useTestAiImport/);

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(quizRoute), false);
    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(hook), false);
    assert.equal(/from\(["']tests["']\)|from\(["']ai_generations["']\)/.test(quizRoute), false);
    assert.equal(/from\(["']tests["']\)|from\(["']ai_generations["']\)/.test(hook), false);

    assert.match(hook, /TestAiImportService\.createDraftFromQuizGeneration/);
    assert.match(hook, /invalidateQueries\(\s*\{\s*queryKey:\s*\[["']tests["']\]/);

    assert.match(testsRoute, /testId/);
    assert.match(testsRoute, /initialTestId/);
  });
});
