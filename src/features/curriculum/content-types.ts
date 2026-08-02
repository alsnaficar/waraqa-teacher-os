/**
 * Curriculum content types — provider-agnostic.
 *
 * Distinct from `CurriculumStorageProvider` (file-level storage): this
 * describes structured *lesson content* resolved for a given
 * stage/grade/subject/semester/lesson.
 */

import type { EducationStage, Semester } from "@/features/ai/components/curriculum-selector";

export type CurriculumContentProviderId = "mock" | "google-drive";

export interface LessonContentQuery {
  stage: EducationStage;
  grade: string;
  subject: string;
  semester: Semester;
  lessonTitle: string;
}

export interface LessonSection {
  heading: string;
  body: string;
}

export interface LessonContent {
  stage: EducationStage;
  grade: string;
  subject: string;
  semester: Semester;
  lessonTitle: string;
  /** One-paragraph overview. */
  summary: string;
  /** Learning objectives. */
  objectives: string[];
  /** Key vocabulary / concepts. */
  keyTerms: string[];
  /** Ordered narrative sections (intro, explanation, examples, …). */
  sections: LessonSection[];
  /** Provider-supplied source reference (file id/url), when known. */
  source?: { providerId: CurriculumContentProviderId; ref?: string };
}

export interface CurriculumProvider {
  readonly id: CurriculumContentProviderId;
  getLessonContent(query: LessonContentQuery): Promise<LessonContent | null>;
}
