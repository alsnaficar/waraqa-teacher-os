/**
 * Mock curriculum content provider.
 *
 * Returns deterministic structured lesson content based on the query,
 * so upstream features (AI generators, previews) can develop against a
 * stable shape while the real Google Drive provider is being built.
 */

import type { CurriculumProvider, LessonContent, LessonContentQuery } from "../content-types";

const STAGE_LABEL: Record<string, string> = {
  primary: "الابتدائية",
  intermediate: "المتوسطة",
  secondary: "الثانوية",
};

export class MockCurriculumProvider implements CurriculumProvider {
  readonly id = "mock" as const;

  async getLessonContent(query: LessonContentQuery): Promise<LessonContent> {
    const { stage, grade, subject, semester, lessonTitle } = query;
    const stageLabel = STAGE_LABEL[stage] ?? stage;

    return {
      stage,
      grade,
      subject,
      semester,
      lessonTitle,
      summary:
        `درس "${lessonTitle}" ضمن مادة ${subject} للمرحلة ${stageLabel} — ${grade}. ` +
        `يقدّم هذا الدرس المفاهيم الأساسية بصورة مبسّطة ومتدرّجة.`,
      objectives: [
        `أن يتعرّف الطالب على مفهوم "${lessonTitle}".`,
        `أن يميّز الطالب بين العناصر الرئيسية في الدرس.`,
        `أن يوظّف الطالب ما تعلّمه في أمثلة تطبيقية.`,
      ],
      keyTerms: ["تعريف", "مثال", "قاعدة", "تطبيق"],
      sections: [
        {
          heading: "تمهيد",
          body: `مقدمة قصيرة تربط الدرس بخبرات الطلاب السابقة في ${subject}.`,
        },
        {
          heading: "الشرح",
          body: `عرض منظّم لمفهوم "${lessonTitle}" مع توضيح خطواته الرئيسية.`,
        },
        {
          heading: "أمثلة",
          body: `أمثلة متدرّجة الصعوبة مناسبة لطلاب ${grade}.`,
        },
        {
          heading: "تقويم",
          body: `أسئلة قصيرة للتحقق من فهم الطلاب لمخرجات الدرس.`,
        },
      ],
      source: { providerId: "mock" },
    };
  }
}
