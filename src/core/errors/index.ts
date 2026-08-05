export type ErrorCode =
  "MADRASATI_CONNECTION" | "TEAMS_CONNECTION" | "AI_ENGINE" | "PDF_PARSE" | "UNKNOWN";

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  createdAt: Date;
}

export class ErrorEngine {
  private readonly errors: AppError[] = [];

  report(error: AppError) {
    this.errors.push(error);
  }

  all() {
    return this.errors;
  }
}
