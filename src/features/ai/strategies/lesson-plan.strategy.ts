import { Type } from "@google/genai";

import {
  AI_PROMPT_CURRICULUM_NOTES_MAX,
  AI_PROMPT_CURRICULUM_OBJECTIVES_MAX,
  AI_PROMPT_CURRICULUM_TITLE_MAX,
  AI_PROMPT_GRADE_MAX,
  AI_PROMPT_SUBJECT_MAX,
  AI_PROMPT_SUGGESTED_DATE_MAX,
  AI_PROMPT_UNIT_MAX,
  AI_REQUEST_TIMEOUT_MESSAGE,
  GEMINI_REQUEST_TIMEOUT_MS,
  clampAiPromptText,
  isAiGeminiTimeoutError,
} from "@/features/ai/providers/ai-request-limits.ts";
import { getGemini } from "@/features/ai/providers/gemini";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";
import type {
  GenerationExecuteResult,
  SessionBoundGenerationContext,
} from "@/features/ai/services/session-bound-generation.types";

export type LessonPlanOptions = {
  subject?: string;
  grade?: string;
  lessonName?: string;
  objectives?: string;
  unit?: string;
  /** Ignored for binding — session.curriculumLessonId is authoritative. */
  lessonId?: string | null;
  suggestedDate?: string;
};

type LessonPlanAiClient = {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config?: Parameters<ReturnType<typeof getGemini>["models"]["generateContent"]>[0]["config"];
    }): Promise<{ text?: string }>;
  };
};

/**
 * Direct Gemini structured-JSON strategy for lesson_plan.
 * Preserves existing prompts, model, and responseSchema.
 * Curriculum/timetable text is clamped for AI prompts only (Hotfix #2.7).
 */
export async function executeLessonPlanGeneration(
  ctx: SessionBoundGenerationContext,
  options: LessonPlanOptions,
  aiClient: LessonPlanAiClient = getGemini(),
): Promise<GenerationExecuteResult> {
  const { session, curriculumLesson } = ctx;
  const notesExtra = deserializeLessonNotes(curriculumLesson?.notes ?? null);

  const timetableEntry = ctx.timetableEntry;

  // Session-bound timetable is authoritative for subject, grade and class.
  const subject = clampAiPromptText(
    timetableEntry?.subject?.trim() || "المادة",
    AI_PROMPT_SUBJECT_MAX,
  );
  const grade = clampAiPromptText(timetableEntry?.grade?.trim() || "الصف", AI_PROMPT_GRADE_MAX);
  const className = clampAiPromptText(timetableEntry?.className?.trim() || "", AI_PROMPT_GRADE_MAX);

  // Session-bound curriculum is authoritative for lesson identity and content.
  const officialLessonName = clampAiPromptText(
    curriculumLesson?.title?.trim() || "الدرس",
    AI_PROMPT_CURRICULUM_TITLE_MAX,
  );
  const officialObjectivesRaw =
    curriculumLesson?.objectives?.trim() || notesExtra.outcomes?.trim() || "";
  const officialObjectives = clampAiPromptText(
    officialObjectivesRaw,
    AI_PROMPT_CURRICULUM_OBJECTIVES_MAX,
  );
  const officialUnit = clampAiPromptText(notesExtra.unitName?.trim() || "", AI_PROMPT_UNIT_MAX);

  // Teacher values are optional enrichments only (already Zod-bounded at entry).
  const teacherObjectives = options.objectives?.trim() || "";
  const teacherUnit = options.unit?.trim() || "";
  const suggestedDateRaw = options.suggestedDate?.trim() || session.sessionDate;
  const suggestedDate = clampAiPromptText(suggestedDateRaw, AI_PROMPT_SUGGESTED_DATE_MAX);

  // Extended curriculum details (title/objectives already in the header — do not re-emit).
  const curriculumContext = [
    notesExtra.unitNumber
      ? `رقم الوحدة: ${clampAiPromptText(notesExtra.unitNumber, AI_PROMPT_UNIT_MAX)}`
      : "",
    notesExtra.unitName
      ? `اسم الوحدة: ${clampAiPromptText(notesExtra.unitName, AI_PROMPT_UNIT_MAX)}`
      : "",
    notesExtra.lessonNumber
      ? `رقم الدرس: ${clampAiPromptText(notesExtra.lessonNumber, AI_PROMPT_UNIT_MAX)}`
      : "",
    // Skip outcomes when they already supplied officialObjectives (avoid double paste).
    notesExtra.outcomes && notesExtra.outcomes.trim() !== officialObjectivesRaw
      ? `نواتج التعلم الرسمية: ${clampAiPromptText(notesExtra.outcomes, AI_PROMPT_CURRICULUM_OBJECTIVES_MAX)}`
      : "",
    notesExtra.activities
      ? `الأنشطة الواردة في المنهج: ${clampAiPromptText(notesExtra.activities, AI_PROMPT_CURRICULUM_NOTES_MAX)}`
      : "",
    notesExtra.assessment
      ? `التقويم الوارد في المنهج: ${clampAiPromptText(notesExtra.assessment, AI_PROMPT_CURRICULUM_NOTES_MAX)}`
      : "",
    notesExtra.periods
      ? `عدد الحصص/الفترات: ${clampAiPromptText(notesExtra.periods, AI_PROMPT_UNIT_MAX)}`
      : "",
    notesExtra.notes
      ? `ملاحظات المنهج: ${clampAiPromptText(notesExtra.notes, AI_PROMPT_CURRICULUM_NOTES_MAX)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const modelName = "gemini-2.5-flash";

  const promptText = `
    أنت خبير تربوي متمكن متخصص في إعداد وتصميم التحاضير الدراسية المتوافقة تماماً مع معايير وزارة التعليم في المملكة العربية السعودية ومنصة "مدرستي".
    مهمتك هي إنشاء تحضير درس نموذجي ومكتمل ومفصل باللغة العربية بناءً على البيانات التالية:

    - المادة الدراسية: ${subject}
    - الصف الدراسي: ${grade}
      ${className ? `- الفصل/الشعبة: ${className}` : ""}
      - اسم الدرس الرسمي: ${officialLessonName}
    ${officialUnit ? `- الوحدة الدراسية الرسمية: ${officialUnit}` : ""}
    ${suggestedDate ? `- تاريخ تنفيذ الدرس: ${suggestedDate}` : ""}
    ${officialObjectives ? `- الأهداف الرسمية: ${officialObjectives}` : ""}

    --- بيانات المنهج الرسمية ---
    ${curriculumContext}
    --- نهاية بيانات المنهج الرسمية ---

      --- إضافات المعلم الاختيارية ---
      ${teacherObjectives ? `أهداف/تركيز إضافي من المعلم: ${teacherObjectives}` : ""}
      ${teacherUnit ? `ملاحظة إضافية من المعلم حول الوحدة: ${teacherUnit}` : ""}
      --- نهاية إضافات المعلم ---

    قواعد مهمة:
    1. اعتبر بيانات المنهج الرسمية المصدر الأساسي لمحتوى التحضير.
    2. لا تستبدل عنوان الدرس أو الأهداف أو نواتج التعلم الرسمية بمعلومات عامة من عندك.
    3. استخدم الأنشطة والتقويم والملاحظات الرسمية عند توفرها.
    4. يمكنك إثراء التحضير تربوياً عند الحاجة، دون مخالفة محتوى المنهج الرسمي.
    5. مدخلات المعلم الاختيارية تعتبر إضافات أو تفضيلات، وليست بديلاً عن بيانات المنهج.
    6. اجعل الناتج جاهزاً للمراجعة والتعديل من قبل المعلم.

    يرجى تقديم التحضير بهيكل عالي الجودة وصيغة JSON مطابقة تماماً للمخطط الهيكلي المطلوب (responseSchema).
    تأكد من أن تكون العبارات مكتوبة بأسلوب تربوي رصين ومناسب ومكتمل بدون أي اختصارات أو نصوص مؤقتة.
  `;

  try {
    const response = await aiClient.models.generateContent({
      model: modelName,
      contents: promptText,
      config: {
        httpOptions: {
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
        },
        systemInstruction: `
            أنت مساعد ذكي مخصص للمعلمين والمعلمات في السعودية. تقوم بتوليد تحاضير دراسية احترافية تناسب بيئة التعليم وتدعم الفروق الفردية والمهارات الرقمية الحديثة.
            يجب أن تكون جميع الاستجابات باللغة العربية الفصحى السليمة والواضحة والخالية من أي صياغات عامية أو غير مكتملة.
          `,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            behavioralObjectives: {
              type: Type.OBJECT,
              properties: {
                cognitive: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "3-4 أهداف معرفية دقيقة تبدأ بـ 'أن + فعل مضارع سلوكي'",
                },
                affective: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "هدفين وجدانيين يركزان على القيم والاتجاهات",
                },
                psychomotor: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "هدفين مهارية/حركية تركز على التطبيق العملي والمهارات",
                },
              },
              required: ["cognitive", "affective", "psychomotor"],
            },
            strategiesAndDigitalSkills: {
              type: Type.OBJECT,
              properties: {
                strategies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "إستراتيجيات التدريس الفعالة والمستخدمة في الدرس",
                },
                digitalSkills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "المهارات الرقمية وأدوات التقنية والمنصات المستخدمة",
                },
              },
              required: ["strategies", "digitalSkills"],
            },
            lessonScenario: {
              type: Type.OBJECT,
              properties: {
                introduction: {
                  type: Type.STRING,
                  description: "مقدمة الدرس والتمهيد الجاذب للطلاب لإثارة دافعيتهم",
                },
                exercises: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "أمثلة وتمارين وأنشطة صفية لتطبيق المفهوم أثناء الحصة",
                },
                deliveryScript: {
                  type: Type.STRING,
                  description: "سيناريو تفصيلي متكامل لخطوات الشرح والتعليم والتعلم بالتفصيل",
                },
              },
              required: ["introduction", "exercises", "deliveryScript"],
            },
            assessmentAndHomework: {
              type: Type.OBJECT,
              properties: {
                homework: {
                  type: Type.STRING,
                  description: "الواجب المنزلي المطلوب لإتقان المهارة",
                },
                summativeAssessment: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "أسئلة للتقويم الختامي للتحقق من مدى فهم الطلاب للأهداف",
                },
              },
              required: ["homework", "summativeAssessment"],
            },
          },
          required: [
            "behavioralObjectives",
            "strategiesAndDigitalSkills",
            "lessonScenario",
            "assessmentAndHomework",
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("استجابة فارغة من خادم توليد التحاضير.");
    }

    const parsedOutput = JSON.parse(responseText.trim()) as Record<string, unknown>;

    return {
      content: parsedOutput,
      model: modelName,
      prompt: `تحضير مباشر لدرس: ${officialLessonName}`,
      input: {
        lessonSessionId: session.id,
        subject,
        grade,
        lessonName: officialLessonName,
        objectives: officialObjectives,
        unit: officialUnit,
        suggestedDate,
      },
      extraOutput: {
        lessonContext: {
          lessonSessionId: session.id,
          curriculumLessonId: session.curriculumLessonId,
          lessonId: session.curriculumLessonId,
          suggestedDate,
          lessonName: officialLessonName,
          subject,
          grade,
          unit: officialUnit,
          sessionStatus: session.status,
        },
      },
    };
  } catch (error) {
    console.error("خطأ أثناء توليد التحضير عبر Gemini:", error);
    if (isAiGeminiTimeoutError(error)) {
      throw new Error(AI_REQUEST_TIMEOUT_MESSAGE);
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : "حدث خطأ غير متوقع أثناء توليد التحضير بالذكاء الاصطناعي.",
    );
  }
}
