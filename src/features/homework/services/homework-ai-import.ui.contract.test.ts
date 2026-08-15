import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("TASK 24 AI worksheet → Homework import UI/hook contracts", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));

  it("18-23. CTA, generation ID, loading, navigation, error, no teacher_id", () => {
    const worksheetRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/ai-worksheet.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(here, "../hooks/useHomeworkAiImport.ts"), "utf8");
    const homeworkRoute = readFileSync(
      path.join(here, "../../../routes/_authenticated/homework.tsx"),
      "utf8",
    );

    assert.match(worksheetRoute, /إنشاء واجب مسودة/);
    assert.match(worksheetRoute, /generationId/);
    assert.match(worksheetRoute, /createDraftFromWorksheetGeneration/);
    assert.match(worksheetRoute, /importPending/);
    assert.match(worksheetRoute, /سيتم إنشاء واجب مسودة يمكنك مراجعته وتعديله قبل إسناده/);
    assert.match(worksheetRoute, /navigate\(\s*\{\s*to:\s*["']\/homework["']/);
    assert.match(worksheetRoute, /homeworkId/);
    assert.match(worksheetRoute, /useHomeworkAiImport/);
    assert.match(worksheetRoute, /toast\.error/);

    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(worksheetRoute), false);
    assert.equal(/\bteacherId\s*[:=]|\bteacher_id\s*[:=]/.test(hook), false);
    assert.equal(
      /from\(["']homework["']\)|from\(["']ai_generations["']\)/.test(worksheetRoute),
      false,
    );
    assert.equal(/from\(["']homework["']\)|from\(["']ai_generations["']\)/.test(hook), false);

    assert.match(hook, /HomeworkAiImportService\.createDraftFromWorksheetGeneration/);
    assert.match(hook, /invalidateQueries\(\s*\{\s*queryKey:\s*\[["']homework["']\]/);

    assert.match(homeworkRoute, /homeworkId/);
    assert.match(homeworkRoute, /initialHomeworkId/);
  });
});
