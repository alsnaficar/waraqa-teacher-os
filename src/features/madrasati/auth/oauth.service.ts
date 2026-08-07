import { supabase } from "@/platform/database/supabase/client";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";

export class MadrasatiOAuthService {
  static async connect(): Promise<void> {
    const connected = await this.isAuthenticated();

    if (!connected) {
      throw new Error("OAuth provider not configured");
    }

    await TeacherTimetableService.syncFromMadrasatiIfAvailable();
  }

  static async disconnect(): Promise<void> {
    await supabase.auth.signOut();
  }

  static async refreshToken(): Promise<void> {}

  static async isAuthenticated(): Promise<boolean> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return !!session;
  }
}
