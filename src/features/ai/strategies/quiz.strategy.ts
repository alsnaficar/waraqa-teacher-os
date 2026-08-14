import { Type } from "@google/genai";

import {
  AI_PROMPT_CURRICULUM_TITLE_MAX,
  AI_REQUEST_TIMEOUT_MESSAGE,
  GEMINI_REQUEST_TIMEOUT_MS,
  clampAiPromptText,
  isAiGeminiTimeoutError,
} from "@/features/ai/providers/ai-request-limits.ts";
import { getGemini } from "@/features/ai/providers/gemini";
import type {
  GenerationExecuteResult,
  SessionBoundGenerationContext,
} from "@/features/ai/services/session-bound-generation.types";

export type QuizOptions = {
  subject?: string;
  grade?: string;
  title?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard";
  semester?: string;
  stage?: "primary" | "intermediate" | "secondary";
};

type QuizAiClient = {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config?: Parameters<ReturnType<typeof getGemini>["models"]["generateContent"]>[0]["config"];
    }): Promise<{ text?: string }>;
  };
};

/**
 * Direct Gemini structured-JSON strategy for quiz.
 * Preserves existing prompts, model, and responseSchema.
 * Curriculum title is clamped for AI prompts only (Hotfix #2.7 P1 residual).
 */
export async function executeQuizGeneration(
  ctx: SessionBoundGenerationContext,
  options: QuizOptions,
  aiClient: QuizAiClient = getGemini(),
): Promise<GenerationExecuteResult> {
  const { session, curriculumLesson } = ctx;

  const subject = options.subject?.trim() || "المادة";
  const grade = options.grade?.trim() || "الصف";
  // Clamp at AI boundary: client titles are already Zod-bounded; curriculum titles may not be.
  const title = clampAiPromptText(
    options.title?.trim() || curriculumLesson?.title || "الدرس",
    AI_PROMPT_CURRICULUM_TITLE_MAX,
  );
  const questionCount = options.questionCount ?? 5;
  const difficulty = options.difficulty ?? "medium";
  const semester = options.semester ?? "";
  const stage = options.stage;

  const modelName = "gemini-2.5-flash";

  const promptText = `
    أنت مستشار تربوي وخبير في صياغة الاختبارات المدرسية وتقويم الطلاب في المملكة العربية السعودية.
    صمم حزمة متكاملة تتضمن:
    1. اختبار قصير (Quiz) باللغة العربية الفصحى السليمة لدرس "${title}" لمادة "${subject}" للصف "${grade}".
    2. واجب منزلي تطبيقي مبتكر يربط المفاهيم بحياة الطالب اليومية ومحيطه الأسري والعملي والتقني في السعودية.

    المتطلبات التفصيلية:
    - إجمالي الأسئلة المطلوبة في الاختبار: ${questionCount} أسئلة موزعة بشكل متوازن بين الأنواع الثلاثة (اختيار من متعدد، صواب وخطأ، مقالي قصير).
    - مستوى الصعوبة المطلوب: ${difficulty === "easy" ? "سهل (يقيس التذكر والفهم المباشر)" : difficulty === "medium" ? "متوسط (يقيس الفهم والتطبيق والتحليل البسيط)" : "صعب/متقدم (يقيس التحليل والتركيب والتفكير الناقد والحل الإبداعي للمشكلات)"}.
    - الأسئلة متعددة الاختيارات: يجب تقديم 4 خيارات واضحة مع إجابة صحيحة واحدة محددة بدقة، وتوفير "تفسير تربوي" يوضح للمعلم وولي الأمر سبب صحة الإجابة.
    - أسئلة صواب أو خطأ: عبارات علمية دقيقة مع تحديد الصواب أو الخطأ وتوضيح التصحيح للعبارات الخاطئة بشكل واضح ومفصل.
    - الأسئلة المقالية القصيرة: أسئلة تتطلب كتابة أو استنتاج، مع توفير "نموذج الإجابة المقترح" للمعلم لتسهيل عملية التصحيح.
    - الواجب المنزلي التطبيقي: يجب أن يكون نشاطاً حياتياً تطبيقياً ممتعاً يحفز تفكير الطالب، وليس مجرد حل تمارين مكررة، مع إرفاق معايير التقييم والزمن المتوقع لإنجازه.

    يرجى توفير مخرجات منظمة ودقيقة بهيكل JSON المطابق للمخطط المطلوب (responseSchema) دون أي اختصارات أو كلمات مؤقتة.
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
            أنت مساعد ذكي ومستشار قياس وتقويم تربوي متمرس في الأنظمة التعليمية السعودية.
            تقوم بصياغة أسئلة واختبارات مدرسية وواجبات تطبيقية تعزز الفهم والمهارات الحياتية والتفكير الناقد والتحصيل الدراسي.
            يجب أن تكون الصياغة باللغة العربية الفصحى التربوية السليمة والخالية من الأخطاء النحوية والإملائية.
          `,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description:
                "عنوان الحزمة المناسب (مثال: اختبار قصير وواجب تطبيقي لدرس الكفاءة الحرارية)",
            },
            mcqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: "نص سؤال الاختيار من متعدد" },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "4 خيارات متوازنة ومصاغة بعناية",
                  },
                  correctAnswer: {
                    type: Type.STRING,
                    description: "الإجابة الصحيحة المطابقة تماماً لأحد الخيارات الأربعة",
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "التفسير التربوي أو العلمي للإجابة الصحيحة",
                  },
                },
                required: ["question", "options", "correctAnswer", "explanation"],
              },
              description: "مجموعة أسئلة الاختيار من متعدد",
            },
            trueFalse: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description: "العبارة المطروحة للتقييم بصواب أو خطأ",
                  },
                  correctAnswer: {
                    type: Type.BOOLEAN,
                    description: "true للصواب أو false للخطأ",
                  },
                  correction: {
                    type: Type.STRING,
                    description:
                      "تصحيح العبارة بالتفصيل في حال كانت خاطئة، أو شرح إضافي معزز في حال كانت صواباً",
                  },
                },
                required: ["question", "correctAnswer", "correction"],
              },
              description: "مجموعة أسئلة صواب أو خطأ",
            },
            shortAnswer: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: "نص السؤال المقالي القصير" },
                  sampleAnswer: {
                    type: Type.STRING,
                    description: "نموذج الإجابة التربوية المقترحة لمساعدة المعلم في التصحيح",
                  },
                },
                required: ["question", "sampleAnswer"],
              },
              description: "مجموعة الأسئلة المقالية القصيرة",
            },
            homeworkAssignment: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "عنوان الواجب المنزلي التطبيقي المبتكر",
                },
                description: {
                  type: Type.STRING,
                  description: "نص تفصيلي لوصف الواجب وكيفية ربطه بالحياة والواقع العملي للطلاب",
                },
                estimatedTime: {
                  type: Type.STRING,
                  description: "الزمن التقديري لإنجازه (مثال: 20 دقيقة)",
                },
                evaluationCriteria: {
                  type: Type.STRING,
                  description: "معايير بسيطة لتقييم أداء الطالب في هذا الواجب",
                },
              },
              required: ["title", "description", "estimatedTime", "evaluationCriteria"],
              description: "الواجب المنزلي التطبيقي المرتبط بالحياة اليومية",
            },
          },
          required: ["title", "mcqs", "trueFalse", "shortAnswer", "homeworkAssignment"],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("استجابة فارغة من خادم توليد الأسئلة.");
    }

    const parsedOutput = JSON.parse(responseText.trim()) as Record<string, unknown>;

    return {
      content: parsedOutput,
      model: modelName,
      prompt: `اختبار وواجب: ${title}`,
      input: {
        lessonSessionId: session.id,
        subject,
        grade,
        title,
        questionCount,
        difficulty,
        semester,
        stage,
      },
    };
  } catch (error) {
    console.error("خطأ أثناء توليد الاختبار عبر Gemini:", error);
    if (isAiGeminiTimeoutError(error)) {
      throw new Error(AI_REQUEST_TIMEOUT_MESSAGE);
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : "حدث خطأ غير متوقع أثناء توليد حزمة الاختبار والواجب بالذكاء الاصطناعي.",
    );
  }
}
