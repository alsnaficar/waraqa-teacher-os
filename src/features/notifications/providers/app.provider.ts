import type { NotificationPayload, NotificationProvider } from "../types";

export class AppProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    console.log("[APP]", payload);
  }
}
