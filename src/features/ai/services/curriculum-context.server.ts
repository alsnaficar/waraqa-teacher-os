/**
 * Server-side helper that enriches an AI prompt with curriculum content
 * resolved via CurriculumContentService. Fully backward compatible:
 * when stage/semester are missing, or the service can't produce content,
 * the returned `promptPrefix` is an empty string and callers should use
 * their existing prompt unchanged.
 */

import { getLessonContent } from "@/features/curriculum/content-service";
import type { EducationStage, Semester } from "@/features/ai/components/curriculum-selector";

export interface EnrichArgs {
  stage?: EducationStage;
  semester?: Semester;
  grade: string;
  subject: string;
  lessonTitle: string;
}

export async function buildCurriculumContext(
  args: EnrichArgs,
): Promise<{ promptPrefix: string; used: boolean }> {
  const { stage, semester, grade, subject, lessonTitle } = args;
  if (!stage || !semester) return { promptPrefix: "", used: false };

  try {
    const content = await getLessonContent({
      stage,
      grade,
      subject,
      semester,
      lessonTitle,
    });
    if (!content) return { promptPrefix: "", used: false };

    const lines: string[] = ["--- سياق المنهج ---"];
    if (content.summary) lines.push(`ملخص: ${content.summary}`);
    if (content.objectives.length)
      lines.push("الأهداف:", ...content.objectives.map((o) => `- ${o}`));
    if (content.keyTerms.length) lines.push(`المفاهيم الأساسية: ${content.keyTerms.join("، ")}`);
    if (content.sections.length) {
      lines.push("محاور الدرس:");
      for (const s of content.sections) lines.push(`• ${s.heading}: ${s.body}`);
    }
    lines.push("--- نهاية سياق المنهج ---", "");
    return { promptPrefix: lines.join("\n"), used: true };
  } catch (err) {
    console.warn("[ai/curriculum-context] Skipped enrichment:", err);
    return { promptPrefix: "", used: false };
  }
}
