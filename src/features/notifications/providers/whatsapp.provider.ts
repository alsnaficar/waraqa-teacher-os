import type { NotificationPayload, NotificationProvider } from "../types";

export class WhatsAppProvider implements NotificationProvider {
  async send(_: NotificationPayload): Promise<void> {
    throw new Error("WhatsApp Provider is not implemented yet.");
  }
}
