import { supabase } from "@/platform/database/supabase/client";

/**
 * Connection state for the Madrasati integration.
 *
 * Madrasati does not expose a public OAuth client yet, so "connected" currently
 * means the teacher has an authenticated Waraqa session that the connector can
 * import into. Kept as a leaf module so callers, not this service, decide what
 * to synchronise once a connection is established.
 */
export class MadrasatiOAuthService {
  static async isAuthenticated(): Promise<boolean> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return Boolean(session);
  }

  static async connect(): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error("يجب تسجيل الدخول قبل ربط حساب مدرستي.");
    }
  }

  static async disconnect(): Promise<void> {
    await supabase.auth.signOut();
  }
}
