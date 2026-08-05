export type TemplateType =
  "lesson-plan" | "worksheet" | "quiz" | "activity" | "enrichment" | "strategies" | "teaching-aids";

export interface TemplateContext {
  stage: string;
  grade: string;
  subject: string;
  lessonTitle: string;
  deliveryMode: "classroom" | "remote";
}

export interface PromptTemplate {
  id: string;
  type: TemplateType;
  version: number;
  build(context: TemplateContext): string;
}

export class TemplateEngine {
  constructor(private readonly templates: Record<TemplateType, PromptTemplate>) {}

  get(type: TemplateType): PromptTemplate {
    return this.templates[type];
  }
}
