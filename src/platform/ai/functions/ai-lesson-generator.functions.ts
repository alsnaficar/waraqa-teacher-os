import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Type } from "@google/genai";
import { getGemini } from "@/features/ai/providers/gemini";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { saveAiGeneration } from "@/features/ai/services/persistence.server";

// Define lazy client initializer to avoid crashes if GEMINI_API_KEY is missing on boot
function getGeminiClient() {
  return getGemini();
}

// Validation input schema for the lesson prep function
const LessonPrepInput = z.object({
  subject: z.string().min(1, "اسم المادة مطلوب"),
  grade: z.string().min(1, "الصف الدراسي مطلوب"),
  lessonName: z.string().min(1, "اسم الدرس مطلوب"),
  objectives: z.string().optional().default(""),
  unit: z.string().optional().default(""),

  lessonId: z.string().nullable().optional(),
  suggestedDate: z.string().optional(),
});

export const generateLessonPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LessonPrepInput.parse(data))
  .handler(async ({ data, context }) => {
    const ai = getGeminiClient();
    const modelName = "gemini-2.5-flash";

    const promptText = `
    أنت خبير تربوي متمكن متخصص في إعداد وتصميم التحاضير الدراسية المتوافقة تماماً مع معايير وزارة التعليم في المملكة العربية السعودية ومنصة "مدرستي".
    مهمتك هي إنشاء تحضير درس نموذجي ومكتمل ومفصل باللغة العربية بناءً على البيانات التالية:

    - المادة الدراسية: ${data.subject}
    - الصف الدراسي: ${data.grade}
    - اسم الدرس: ${data.lessonName}
    ${data.unit ? `- الوحدة الدراسية: ${data.unit}` : ""}
${data.suggestedDate ? `- تاريخ تنفيذ الدرس: ${data.suggestedDate}` : ""}
${data.objectives ? `- الأهداف الإضافية المدخلة من المعلم: ${data.objectives}` : ""}

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

      // Persist the generated lesson plan in the database for tracking history
      const savedRow = await saveAiGeneration(context.supabase, {
        userId: context.userId,
        kind: "lesson_plan",
        prompt: `تحضير مباشر لدرس: ${data.lessonName}`,
        output: {
          content: parsedOutput,
          input: data,
          model: modelName,

          lessonContext: {
            lessonId: data.lessonId ?? null,
            suggestedDate: data.suggestedDate ?? null,
            lessonName: data.lessonName,
            subject: data.subject,
            grade: data.grade,
            unit: data.unit ?? "",
          },
        },
      });

      return {
        id: savedRow.id,
        content: parsedOutput,
        createdAt: savedRow.createdAt,
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
