import { supabase } from "@/platform/database/supabase/client";

export class LessonSessionService {
  /**
   * Returns today's lesson sessions.
   */
  static async getTodaySessions() {
    throw new Error("Not implemented");
  }

  /**
   * Returns a lesson session by id.
   */
  static async getById(id: string) {
    throw new Error("Not implemented");
  }

  /**
   * Creates today's lesson sessions from the timetable.
   */
  static async generateTodaySessions() {
    throw new Error("Not implemented");
  }

  /**
   * Marks lesson as prepared.
   */
  static async prepareSession(id: string) {
    throw new Error("Not implemented");
  }

  /**
   * Deletes preparation and unlocks lesson.
   */
  static async resetPreparation(id: string) {
    throw new Error("Not implemented");
  }

  /**
   * Changes lesson before preparation.
   */
  static async changeLesson(
    sessionId: string,
    lessonId: string,
  ) {
    throw new Error("Not implemented");
  }
}
