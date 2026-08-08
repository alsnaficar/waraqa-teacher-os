import { Type } from "@google/genai";

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

/**
 * Direct Gemini structured-JSON strategy for lesson_plan.
 * Preserves existing prompts, model, and responseSchema.
 */
export async function executeLessonPlanGeneration(
  ctx: SessionBoundGenerationContext,
  options: LessonPlanOptions,
): Promise<GenerationExecuteResult> {
  const { session, curriculumLesson } = ctx;
  const notesExtra = deserializeLessonNotes(curriculumLesson?.notes ?? null);

  const timetableEntry = ctx.timetableEntry;

  // Session-bound timetable is authoritative for subject, grade and class.
  const subject = timetableEntry?.subject?.trim() || "المادة";
  const grade = timetableEntry?.grade?.trim() || "الصف";
  const className = timetableEntry?.className?.trim() || "";

  // Session-bound curriculum is authoritative for lesson identity and content.
  const officialLessonName = curriculumLesson?.title?.trim() || "الدرس";
  const officialObjectives =
    curriculumLesson?.objectives?.trim() || notesExtra.outcomes?.trim() || "";
  const officialUnit = notesExtra.unitName?.trim() || "";

  // Teacher values are optional enrichments only.
  const teacherObjectives = options.objectives?.trim() || "";
  const teacherUnit = options.unit?.trim() || "";
  const suggestedDate = options.suggestedDate?.trim() || session.sessionDate;

  // Official curriculum context is authoritative for lesson content.
  // Teacher options can enrich the request, but must not replace curriculum data.
  const curriculumContext = [
    `عنوان الدرس الرسمي: ${officialLessonName}`,
    curriculumLesson?.objectives ? `الأهداف الرسمية: ${curriculumLesson.objectives}` : "",
    notesExtra.unitNumber ? `رقم الوحدة: ${notesExtra.unitNumber}` : "",
    notesExtra.unitName ? `اسم الوحدة: ${notesExtra.unitName}` : "",
    notesExtra.lessonNumber ? `رقم الدرس: ${notesExtra.lessonNumber}` : "",
    notesExtra.outcomes ? `نواتج التعلم الرسمية: ${notesExtra.outcomes}` : "",
    notesExtra.activities ? `الأنشطة الواردة في المنهج: ${notesExtra.activities}` : "",
    notesExtra.assessment ? `التقويم الوارد في المنهج: ${notesExtra.assessment}` : "",
    notesExtra.periods ? `عدد الحصص/الفترات: ${notesExtra.periods}` : "",
    notesExtra.notes ? `ملاحظات المنهج: ${notesExtra.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = getGemini();
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
    const response = await ai.models.generateContent({
      model: modelName,
      contents: promptText,
      config: {
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
    throw new Error(
      error instanceof Error
        ? error.message
        : "حدث خطأ غير متوقع أثناء توليد التحضير بالذكاء الاصطناعي.",
    );
  }
}
