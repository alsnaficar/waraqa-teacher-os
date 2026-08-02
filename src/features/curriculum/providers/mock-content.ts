import type { CurriculumProvider, LessonContent, LessonContentQuery } from "../content-types";

export class MockCurriculumProvider implements CurriculumProvider {
  readonly id = "mock" as const;

  async getLessonContent(query: LessonContentQuery): Promise<LessonContent | null> {
    return {
      stage: query.stage,
      grade: query.grade,
      subject: query.subject,
      semester: query.semester,
      lessonTitle: query.lessonTitle,
      summary: `محتوى تجريبي للدرس: ${query.lessonTitle}`,
      objectives: [],
      keyTerms: [],
      sections: [],
      source: {
        providerId: "mock",
        ref: "mock",
      },
    };
  }
}
