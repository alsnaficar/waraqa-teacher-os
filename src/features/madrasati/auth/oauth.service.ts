/**
 * Madrasati connection status helpers.
 *
 * Live Madrasati browser sync is not available yet. This module must never treat
 * a Waraqa Supabase session as a Madrasati connection, and must never sign the
 * teacher out of Waraqa when "disconnecting" Madrasati.
 */

import { MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE } from "../../../platform/integration/connectors/madrasati/madrasati-status.ts";

export const MADRASATI_CONNECTION_UNAVAILABLE_MESSAGE = MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE;

export class MadrasatiOAuthService {
  /**
   * True only when a real Madrasati browser session exists.
   * Always false until MadrasatiBrowserAdapter is implemented and online.
   */
  static async isConnected(): Promise<boolean> {
    return false;
  }

  /**
   * @deprecated Use {@link isConnected}. Kept so older callers do not treat
   * Waraqa login as Madrasati authentication.
   */
  static async isAuthenticated(): Promise<boolean> {
    return this.isConnected();
  }

  static async connect(): Promise<void> {
    throw new Error(MADRASATI_CONNECTION_UNAVAILABLE_MESSAGE);
  }

  /**
   * Clears a future Madrasati browser session only.
   * Intentionally does not sign the teacher out of Waraqa.
   */
  static async disconnect(): Promise<void> {
    // No Madrasati session to clear yet.
  }

  static getStatusMessage(): string {
    return MADRASATI_CONNECTION_UNAVAILABLE_MESSAGE;
  }
}
