import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isWorksheetMarkdownContent,
  mapWorksheetContentToHomeworkDraft,
} from "./homework-ai-import.logic.ts";

const SAMPLE_MARKDOWN = `# واجب الوحدة

## الأسئلة
1. اشرح المفهوم.
2. حل التمرين.`;

describe("TASK 24 homework AI import mapper", () => {
  it("1. accepts actual worksheet markdown content shape", () => {
    assert.equal(isWorksheetMarkdownContent(SAMPLE_MARKDOWN), true);
    assert.equal(isWorksheetMarkdownContent(""), false);
    assert.equal(isWorksheetMarkdownContent("   "), false);
    assert.equal(isWorksheetMarkdownContent({ title: "x" }), false);
    assert.equal(isWorksheetMarkdownContent(null), false);
  });

  it("2. maps title from meta (prefixes واجب when needed)", () => {
    const mapped = mapWorksheetContentToHomeworkDraft(SAMPLE_MARKDOWN, {
      title: "الميزان الصرفي",
    });
    assert.equal(mapped.title, "واجب: الميزان الصرفي");

    const alreadyPrefixed = mapWorksheetContentToHomeworkDraft(SAMPLE_MARKDOWN, {
      title: "واجب منزلي — الوحدة",
    });
    assert.equal(alreadyPrefixed.title, "واجب منزلي — الوحدة");
  });

  it("3. maps markdown content into instructions", () => {
    const mapped = mapWorksheetContentToHomeworkDraft(`  ${SAMPLE_MARKDOWN}  `, {
      title: "درس",
    });
    assert.equal(mapped.instructions, SAMPLE_MARKDOWN);
    assert.equal(mapped.status, "draft");
  });

  it("4. preserves lessonSessionId, subject, and grade when provided", () => {
    const mapped = mapWorksheetContentToHomeworkDraft(SAMPLE_MARKDOWN, {
      title: "درس",
      subject: "لغة عربية",
      grade: "أول متوسط",
      lessonSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.equal(mapped.lessonSessionId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(mapped.subject, "لغة عربية");
    assert.equal(mapped.grade, "أول متوسط");
  });

  it("5. rejects malformed / empty generation content", () => {
    assert.throws(
      () => mapWorksheetContentToHomeworkDraft("", { title: "درس" }),
      /غير صالح أو فارغ/,
    );
    assert.throws(
      () => mapWorksheetContentToHomeworkDraft({ content: "x" }, { title: "درس" }),
      /غير صالح أو فارغ/,
    );
    assert.throws(() => mapWorksheetContentToHomeworkDraft(null), /غير صالح أو فارغ/);
  });

  it("falls back to default title when meta title missing", () => {
    const mapped = mapWorksheetContentToHomeworkDraft(SAMPLE_MARKDOWN, {});
    assert.equal(mapped.title, "واجب منزلي");
    assert.equal(mapped.lessonSessionId, null);
    assert.equal(mapped.subject, null);
    assert.equal(mapped.grade, null);
  });
});
