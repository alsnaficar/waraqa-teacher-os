import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SessionBoundGenerationContext } from "@/features/ai/services/session-bound-generation.types";

const generateCalls: Array<{
  model: string;
  contents: string;
}> = [];

const fakeGemini = {
  models: {
    async generateContent(input: { model: string; contents: string; config?: unknown }) {
      generateCalls.push({
        model: input.model,
        contents: input.contents,
      });

      return {
        text: JSON.stringify({
          behavioralObjectives: {
            cognitive: ["أن يحدد الطالب المفهوم"],
            affective: ["أن يقدر أهمية المفهوم"],
            psychomotor: ["أن يطبق المفهوم"],
          },
          strategiesAndDigitalSkills: {
            strategies: ["التعلم التعاوني"],
            digitalSkills: ["استخدام منصة مدرستي"],
          },
          lessonScenario: {
            introduction: "تمهيد تجريبي",
            exercises: ["نشاط تجريبي"],
            deliveryScript: "شرح تجريبي",
          },
          assessmentAndHomework: {
            homework: "واجب تجريبي",
            summativeAssessment: ["سؤال تجريبي"],
          },
        }),
      };
    },
  },
};

const { executeLessonPlanGeneration } = await import("./lesson-plan.strategy.ts");

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURRICULUM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeContext(): SessionBoundGenerationContext {
  return {
    session: {
      id: SESSION_ID,
      teacherId: "11111111-1111-4111-8111-111111111111",
      academicYearId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      semesterId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      gradeId: null,
      classId: null,
      curriculumLessonId: CURRICULUM_ID,
      curriculumLessonSource: "plan",
      sessionDate: "2026-08-08",
      dayOfWeek: 5,
      periodNumber: 1,
      lessonLocked: false,
      status: "scheduled",
      preparedAt: null,
      completedAt: null,
      createdAt: "2026-08-08T00:00:00Z",
      updatedAt: "2026-08-08T00:00:00Z",
    },
    curriculumLesson: {
      id: CURRICULUM_ID,
      title: "الكسور المتكافئة",
      objectives: "أن يميز الطالب الكسور المتكافئة ويحددها.",
      notes: JSON.stringify({
        unitName: "الكسور والأعداد العشرية",
        unitNumber: "3",
        lessonNumber: "2",
        outcomes: "تمييز الكسور المتكافئة وتطبيقها.",
        activities: "نشاط بطاقات الكسور.",
        assessment: "تقويم قصير في نهاية الدرس.",
      }),
    },
    timetableEntry: {
      id: "tttttttt-tttt-4ttt-8ttt-tttttttttttt",
      teacherId: "11111111-1111-4111-8111-111111111111",
      dayOfWeek: 5,
      period: 1,
      subject: "الرياضيات",
      grade: "الصف السادس الابتدائي",
      className: "سادس أ",
      classroom: "101",
      startsAt: "08:00",
      endsAt: "08:45",
      active: true,
    },
    auth: {} as SessionBoundGenerationContext["auth"],
    supabase: {} as SessionBoundGenerationContext["supabase"],
    userId: "11111111-1111-4111-8111-111111111111",
  };
}

describe("P3 Step 5 lesson-plan strategy session authority", () => {
  it("uses timetable and curriculum as authoritative context", async () => {
    generateCalls.length = 0;

    const result = await executeLessonPlanGeneration(
      makeContext(),
      {
        subject: "مادة مزورة",
        grade: "صف مزور",
        lessonName: "درس مزور",
        objectives: "أهداف مزورة",
        unit: "وحدة مزورة",
        lessonId: "99999999-9999-4999-8999-999999999999",
        suggestedDate: "2026-08-09",
      },
      fakeGemini,
    );

    assert.equal(generateCalls.length, 1);

    const call = generateCalls[0];
    assert.ok(call);

    assert.equal(call.model, "gemini-2.5-flash");

    // Session timetable is authoritative.
    assert.match(call.contents, /المادة الدراسية: الرياضيات/);
    assert.match(call.contents, /الصف الدراسي: الصف السادس الابتدائي/);
    assert.match(call.contents, /الفصل\/الشعبة: سادس أ/);

    // Session curriculum is authoritative.
    assert.match(call.contents, /اسم الدرس الرسمي: الكسور المتكافئة/);
    assert.match(call.contents, /الأهداف الرسمية: أن يميز الطالب الكسور المتكافئة ويحددها/);
    assert.match(call.contents, /الوحدة الدراسية الرسمية: الكسور والأعداد العشرية/);

    // Official curriculum metadata is included.
    assert.match(call.contents, /رقم الوحدة: 3/);
    assert.match(call.contents, /رقم الدرس: 2/);
    assert.match(call.contents, /نواتج التعلم الرسمية: تمييز الكسور المتكافئة وتطبيقها/);
    assert.match(call.contents, /الأنشطة الواردة في المنهج: نشاط بطاقات الكسور/);
    assert.match(call.contents, /التقويم الوارد في المنهج: تقويم قصير في نهاية الدرس/);

    // Teacher input is enrichment only, not identity.
    assert.match(call.contents, /أهداف\/تركيز إضافي من المعلم: أهداف مزورة/);
    assert.match(call.contents, /ملاحظة إضافية من المعلم حول الوحدة: وحدة مزورة/);

    assert.doesNotMatch(call.contents, /المادة الدراسية: مادة مزورة/);
    assert.doesNotMatch(call.contents, /الصف الدراسي: صف مزور/);
    assert.doesNotMatch(call.contents, /اسم الدرس الرسمي: درس مزور/);

    assert.equal(result.input.lessonSessionId, SESSION_ID);
    assert.equal(result.input.subject, "الرياضيات");
    assert.equal(result.input.grade, "الصف السادس الابتدائي");
    assert.equal(result.input.lessonName, "الكسور المتكافئة");
    assert.equal(result.input.objectives, "أن يميز الطالب الكسور المتكافئة ويحددها.");
    assert.equal(result.input.unit, "الكسور والأعداد العشرية");

    const lessonContext = result.extraOutput?.lessonContext as
      { lessonSessionId?: string; curriculumLessonId?: string } | undefined;

    assert.equal(lessonContext?.lessonSessionId, SESSION_ID);
    assert.equal(lessonContext?.curriculumLessonId, CURRICULUM_ID);
  });

  it("does not make a real Gemini API call", async () => {
    generateCalls.length = 0;

    const result = await executeLessonPlanGeneration(makeContext(), {}, fakeGemini);

    assert.equal(generateCalls.length, 1);
    assert.equal(result.model, "gemini-2.5-flash");
    assert.ok(result.content);
  });
});
