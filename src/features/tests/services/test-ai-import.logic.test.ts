import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StructuredQuizAndAssignmentData } from "@/platform/ai/docx";

import {
  AI_IMPORT_DEFAULT_POINTS,
  buildImportInstructions,
  isStructuredQuizContent,
  mapQuizContentToImportQuestions,
} from "./test-ai-import.logic.ts";

/** Production-shaped payload matching quiz.strategy / StructuredQuizAndAssignmentData. */
function productionQuizPayload(
  overrides: Partial<StructuredQuizAndAssignmentData> = {},
): StructuredQuizAndAssignmentData {
  return {
    title: "اختبار قصير وواجب تطبيقي لدرس الكفاءة الحرارية",
    mcqs: [
      {
        question: "ما المقصود بالكفاءة الحرارية؟",
        options: ["نسبة الشغل إلى الحرارة", "كمية الحرارة فقط", "درجة الحرارة", "الضغط"],
        correctAnswer: "نسبة الشغل إلى الحرارة",
        explanation: "الكفاءة الحرارية هي نسبة الشغل الناتج إلى الحرارة الداخلة.",
      },
      {
        question: "وحدة قياس الطاقة الحرارية الشائعة؟",
        options: ["جول", "نيوتن", "باسكال", "أمبير"],
        correctAnswer: "جول",
        explanation: "الجول وحدة طاقة.",
      },
    ],
    trueFalse: [
      {
        question: "الكفاءة الحرارية لا تتجاوز 100٪ في المحركات الحقيقية.",
        correctAnswer: true,
        correction: "صواب بسبب الفاقد الحراري.",
      },
      {
        question: "الحرارة والشغل متكافئان دائماً دون فاقد.",
        correctAnswer: false,
        correction: "يوجد دائماً فاقد في الأنظمة الحقيقية.",
      },
    ],
    shortAnswer: [
      {
        question: "اشرح باختصار قانون حفظ الطاقة.",
        sampleAnswer: "الطاقة لا تفنى ولا تستحدث من العدم.",
      },
    ],
    homeworkAssignment: {
      title: "قياس درجة حرارة المنزل",
      description: "سجّل درجات الحرارة في غرف مختلفة.",
      estimatedTime: "20 دقيقة",
      evaluationCriteria: "دقة التسجيل والتحليل.",
    },
    ...overrides,
  };
}

describe("TASK 22.8 test-ai-import.logic mapper", () => {
  it("1-4. maps MCQ options, correct option, and true/false", () => {
    const mapped = mapQuizContentToImportQuestions(productionQuizPayload());
    assert.equal(mapped.title, "اختبار قصير وواجب تطبيقي لدرس الكفاءة الحرارية");

    const firstMcq = mapped.questions[0];
    assert.ok(firstMcq);
    assert.equal(firstMcq.type, "multiple_choice");
    assert.equal(firstMcq.prompt, "ما المقصود بالكفاءة الحرارية؟");
    assert.equal(firstMcq.options?.length, 4);
    assert.equal(firstMcq.options?.filter((o) => o.isCorrect).length, 1);
    assert.equal(
      firstMcq.options?.find((o) => o.isCorrect)?.label,
      "نسبة الشغل إلى الحرارة",
    );

    const firstTf = mapped.questions.find((q) => q.type === "true_false");
    assert.ok(firstTf);
    assert.equal(firstTf.correctBoolean, true);
    assert.match(firstTf.prompt, /الكفاءة الحرارية/);
  });

  it("5. preserves question order: MCQs then true/false", () => {
    const mapped = mapQuizContentToImportQuestions(productionQuizPayload());
    assert.equal(mapped.questions.length, 4);
    assert.deepEqual(
      mapped.questions.map((q) => q.position),
      [0, 1, 2, 3],
    );
    assert.equal(mapped.questions[0]?.type, "multiple_choice");
    assert.equal(mapped.questions[1]?.type, "multiple_choice");
    assert.equal(mapped.questions[2]?.type, "true_false");
    assert.equal(mapped.questions[3]?.type, "true_false");
  });

  it("6. preserves points when present; defaults otherwise", () => {
    const withPoints = productionQuizPayload({
      mcqs: [
        {
          question: "سؤال بنقاط",
          options: ["أ", "ب"],
          correctAnswer: "أ",
          explanation: "تفسير",
          // points not on the production type, but mapper reads optional field
          ...({ points: 3 } as object),
        } as StructuredQuizAndAssignmentData["mcqs"][number],
      ],
      trueFalse: [],
      shortAnswer: [],
    });
    const mapped = mapQuizContentToImportQuestions(withPoints);
    assert.equal(mapped.questions[0]?.points, 3);

    const defaults = mapQuizContentToImportQuestions(productionQuizPayload());
    assert.equal(defaults.questions[0]?.points, AI_IMPORT_DEFAULT_POINTS);
  });

  it("7. skips short-answer questions", () => {
    const mapped = mapQuizContentToImportQuestions(productionQuizPayload());
    assert.equal(mapped.skippedShortAnswerCount, 1);
    assert.equal(
      mapped.questions.some((q) => /قانون حفظ الطاقة/.test(q.prompt)),
      false,
    );
    assert.match(buildImportInstructions(mapped), /مقالي قصير/);
  });

  it("8. handles malformed questions safely", () => {
    const mapped = mapQuizContentToImportQuestions(
      productionQuizPayload({
        mcqs: [
          {
            question: "",
            options: ["أ", "ب"],
            correctAnswer: "أ",
            explanation: "x",
          },
          {
            question: "صالح",
            options: ["أ", "ب"],
            correctAnswer: "أ",
            explanation: "x",
          },
        ],
        trueFalse: [
          {
            question: "بدون إجابة منطقية",
            correctAnswer: "نعم" as unknown as boolean,
            correction: "x",
          },
        ],
        shortAnswer: [],
      }),
    );
    assert.equal(mapped.questions.length, 1);
    assert.equal(mapped.questions[0]?.prompt, "صالح");
    assert.equal(mapped.skippedMalformedCount, 2);
  });

  it("9. rejects MCQ with zero or multiple correct option matches", () => {
    const zero = mapQuizContentToImportQuestions(
      productionQuizPayload({
        mcqs: [
          {
            question: "بدون تطابق",
            options: ["أ", "ب"],
            correctAnswer: "ج",
            explanation: "x",
          },
        ],
        trueFalse: [],
        shortAnswer: [],
      }),
    );
    assert.equal(zero.questions.length, 0);
    assert.equal(zero.skippedMalformedCount, 1);

    const multi = mapQuizContentToImportQuestions(
      productionQuizPayload({
        mcqs: [
          {
            question: "تكرار",
            options: ["نفس", "نفس"],
            correctAnswer: "نفس",
            explanation: "x",
          },
        ],
        trueFalse: [],
        shortAnswer: [],
      }),
    );
    assert.equal(multi.questions.length, 0);
    assert.equal(multi.skippedMalformedCount, 1);
  });

  it("10. accepts actual production AI quiz JSON shape", () => {
    const payload = productionQuizPayload();
    assert.equal(isStructuredQuizContent(payload), true);
    const mapped = mapQuizContentToImportQuestions(payload, {
      subject: "علوم",
      grade: "أول متوسط",
    });
    assert.equal(mapped.subject, "علوم");
    assert.equal(mapped.grade, "أول متوسط");
    assert.ok(mapped.questions.length >= 2);
  });

  it("rejects non-quiz content structures", () => {
    assert.throws(
      () => mapQuizContentToImportQuestions({ title: "فقط" }),
      /غير صالح/,
    );
    assert.throws(() => mapQuizContentToImportQuestions(null), /غير صالح/);
  });
});
