/**
 * Curriculum content service — single entry point for lesson content.
 *
 * Kept separate from the file-storage service (`getCurriculumService`)
 * so UI/AI callers depend on the abstraction, not the backing store.
 * Default provider is the mock; the Drive provider is a stub today
 * and returns null, which triggers automatic fallback here.
 */

import { MockCurriculumProvider } from "./providers/mock-content";
import { supabase } from "@/platform/database/supabase/client";
import type {
  CurriculumContentProviderId,
  CurriculumProvider,
  LessonContent,
  LessonContentQuery,
} from "./content-types";

export class SupabaseCurriculumProvider implements CurriculumProvider {
  readonly id = "google-drive" as const;

  async getLessonContent(query: LessonContentQuery): Promise<LessonContent | null> {
    try {
      const { grade, subject, semester, lessonTitle } = query;

      // 1. Find matching curriculum files that are PUBLISHED (newest first)
      const { data: files, error: fileErr } = await supabase
        .from("curriculum_files")
        .select("id")
        .eq("grade", grade)
        .eq("subject", subject)
        .eq("semester", semester)
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (fileErr || !files || files.length === 0) {
        console.info(
          `[supabase-curriculum] No published files found for ${subject} - ${grade} - ${semester}`,
        );
        return null;
      }

      const fileIds = files.map((f) => f.id);

      // 2. Find a matching lesson within those files
      const { data: lessons, error: lessonErr } = await supabase
        .from("curriculum_lessons")
        .select("id, title, objectives, notes")
        .in("curriculum_file_id", fileIds)
        .ilike("title", `%${lessonTitle}%`)
        .limit(1);

      if (lessonErr || !lessons || lessons.length === 0) {
        console.info(`[supabase-curriculum] Lesson "${lessonTitle}" not found in Supabase.`);
        return null;
      }

      const lesson = lessons[0];
      let notesText = lesson.notes || "";
      let objectivesList = lesson.objectives
        ? [lesson.objectives]
        : [`فهم الأهداف التعليمية لدرس "${lesson.title}"`];
      let outcomesText = "";
      let activitiesText = "";
      let assessmentText = "";
      let periodsText = "";
      let unitInfo = "";

      if (
        lesson.notes &&
        lesson.notes.trim().startsWith("{") &&
        lesson.notes.trim().endsWith("}")
      ) {
        try {
          const extra = JSON.parse(lesson.notes.trim());
          notesText = extra.notes || "";
          outcomesText = extra.outcomes || "";
          activitiesText = extra.activities || "";
          assessmentText = extra.assessment || "";
          periodsText = extra.periods || "";
          if (extra.unitNumber || extra.unitName) {
            unitInfo = `الوحدة: ${extra.unitNumber || ""} ${extra.unitName || ""}`;
          }
          if (lesson.objectives) {
            objectivesList = [lesson.objectives];
          } else if (extra.objectives) {
            objectivesList = [extra.objectives];
          }
        } catch (e) {
          // fallback
        }
      }

      // Build a beautifully formatted content string for Gemini/Syllabus context
      const formattedSections = [];
      if (unitInfo) {
        formattedSections.push({ heading: "الوحدة الدراسية", body: unitInfo });
      }
      if (outcomesText) {
        formattedSections.push({ heading: "مخرجات التعلم", body: outcomesText });
      }
      if (activitiesText) {
        formattedSections.push({ heading: "الأنشطة المقترحة", body: activitiesText });
      }
      if (assessmentText) {
        formattedSections.push({ heading: "أساليب التقييم", body: assessmentText });
      }
      if (periodsText) {
        formattedSections.push({ heading: "عدد الحصص المقررة", body: `${periodsText} حصة` });
      }
      if (notesText) {
        formattedSections.push({ heading: "ملاحظات الدرس", body: notesText });
      } else {
        formattedSections.push({
          heading: "محتوى الدرس",
          body: `شرح تفصيلي وتحضير متكامل لدرس "${lesson.title}".`,
        });
      }

      return {
        stage: query.stage,
        grade,
        subject,
        semester,
        lessonTitle: lesson.title,
        summary:
          outcomesText || notesText || `شرح وتحليل مفاهيم درس "${lesson.title}" لمادة ${subject}.`,
        objectives: objectivesList,
        keyTerms: ["تعريف", "مثال", "قاعدة", "تطبيق"],
        sections: formattedSections,
        source: { providerId: "google-drive", ref: lesson.id },
      };
    } catch (e) {
      console.error("[supabase-curriculum] Failed to load curriculum from database:", e);
      return null;
    }
  }
}

const DEFAULT_PROVIDER: CurriculumContentProviderId = "google-drive";

const cache = new Map<CurriculumContentProviderId, CurriculumProvider>();

function build(id: CurriculumContentProviderId): CurriculumProvider {
  const existing = cache.get(id);
  if (existing) return existing;
  const provider: CurriculumProvider =
    id === "google-drive" ? new SupabaseCurriculumProvider() : new MockCurriculumProvider();
  cache.set(id, provider);
  return provider;
}

export function getCurriculumContentService(
  id: CurriculumContentProviderId = DEFAULT_PROVIDER,
): CurriculumProvider {
  return build(id);
}

/**
 * Convenience: try the requested provider, fall back to mock if it
 * returns null or throws. Guarantees a LessonContent to callers.
 */
export async function getLessonContent(
  query: LessonContentQuery,
  id: CurriculumContentProviderId = DEFAULT_PROVIDER,
): Promise<LessonContent> {
  try {
    const primary = build(id);
    const result = await primary.getLessonContent(query);
    if (result) return result;
    console.info(
      `[curriculum/content] Provider "${id}" returned no content — falling back to mock.`,
    );
  } catch (err) {
    console.warn(`[curriculum/content] Provider "${id}" failed — falling back to mock:`, err);
  }
  const fallback = build("mock");
  const result = await fallback.getLessonContent(query);
  // Mock always returns content.
  return result as LessonContent;
}

export type {
  CurriculumContentProviderId,
  CurriculumProvider,
  LessonContent,
  LessonContentQuery,
  LessonSection,
} from "./content-types";
