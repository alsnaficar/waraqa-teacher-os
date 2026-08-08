import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Type } from "@google/genai";
import { getGemini } from "@/features/ai/providers/gemini";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { saveAiGeneration } from "@/features/ai/services/persistence.server";
import {
  loadCurriculumLessonForSession,
  requireOwnedLessonSession,
} from "@/features/lesson-sessions/services/require-owned-lesson-session";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";

function getGeminiClient() {
  return getGemini();
}

/** Display/context fields may accompany the session; binding identity is lessonSessionId only. */
const LessonPrepInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  subject: z.string().min(1, "اسم المادة مطلوب").optional(),
  grade: z.string().min(1, "الصف الدراسي مطلوب").optional(),
  lessonName: z.string().optional(),
  objectives: z.string().optional().default(""),
  unit: z.string().optional().default(""),
  /** Ignored for binding — session.curriculumLessonId is authoritative. */
  lessonId: z.string().nullable().optional(),
  suggestedDate: z.string().optional(),
});

export const generateLessonPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LessonPrepInput.parse(data))
  .handler(async ({ data, context }) => {
    const authContext = { client: context.supabase, userId: context.userId };
    const session = await requireOwnedLessonSession(data.lessonSessionId, authContext);
    const curriculumLesson = await loadCurriculumLessonForSession(session, authContext);
    const notesExtra = deserializeLessonNotes(curriculumLesson?.notes ?? null);

    const subject = data.subject?.trim() || "المادة";
    const grade = data.grade?.trim() || "الصف";
    const lessonName = data.lessonName?.trim() || curriculumLesson?.title || "الدرس";
    const objectives =
      data.objectives?.trim() || curriculumLesson?.objectives || notesExtra.outcomes || "";
    const unit = data.unit?.trim() || notesExtra.unitName || "";
    const suggestedDate = data.suggestedDate?.trim() || session.sessionDate;

    const ai = getGeminiClient();
    const modelName = "gemini-2.5-flash";

    const promptText = `
    أنت خبير تربوي متمكن متخصص في إعداد وتصميم التحاضير الدراسية المتوافقة تماماً مع معايير وزارة التعليم في المملكة العربية السعودية ومنصة "مدرستي".
    مهمتك هي إنشاء تحضير درس نموذجي ومكتمل ومفصل باللغة العربية بناءً على البيانات التالية:

    - المادة الدراسية: ${subject}
    - الصف الدراسي: ${grade}
    - اسم الدرس: ${lessonName}
    ${unit ? `- الوحدة الدراسية: ${unit}` : ""}
${suggestedDate ? `- تاريخ تنفيذ الدرس: ${suggestedDate}` : ""}
${objectives ? `- الأهداف الإضافية المدخلة من المعلم: ${objectives}` : ""}

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

      const parsedOutput = JSON.parse(responseText.trim());

      const savedRow = await saveAiGeneration(context.supabase, {
        userId: context.userId,
        kind: "lesson_plan",
        prompt: `تحضير مباشر لدرس: ${lessonName}`,
        lessonSessionId: session.id,
        output: {
          content: parsedOutput,
          input: {
            lessonSessionId: session.id,
            subject,
            grade,
            lessonName,
            objectives,
            unit,
            suggestedDate,
          },
          model: modelName,
          lessonContext: {
            lessonSessionId: session.id,
            curriculumLessonId: session.curriculumLessonId,
            // Client-supplied lessonId is never used as binding identity.
            lessonId: session.curriculumLessonId,
            suggestedDate,
            lessonName,
            subject,
            grade,
            unit,
            sessionStatus: session.status,
          },
        },
      });

      return {
        id: savedRow.id,
        content: parsedOutput,
        createdAt: savedRow.createdAt,
        lessonSessionId: session.id,
        curriculumLessonId: session.curriculumLessonId,
      };
    } catch (error) {
      console.error("خطأ أثناء توليد التحضير عبر Gemini:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع أثناء توليد التحضير بالذكاء الاصطناعي.",
      );
    }
  });
