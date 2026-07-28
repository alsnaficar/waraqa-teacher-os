/**
 * Google Drive curriculum content provider — STUB.
 *
 * Does NOT call the Google Drive API. A later step will resolve the
 * curriculum document (e.g. Doc/PDF) for the given stage/grade/subject/
 * semester, extract the section matching `lessonTitle`, and return a
 * LessonContent shape. For now, returns null so the service can fall
 * back to the mock provider without breaking callers.
 */

import type { CurriculumProvider, LessonContent, LessonContentQuery } from "../content-types";

export class GoogleDriveCurriculumContentProvider implements CurriculumProvider {
  readonly id = "google-drive" as const;

  async getLessonContent(_query: LessonContentQuery): Promise<LessonContent | null> {
    // Intentionally not implemented — see file header.
    return null;
  }
}
