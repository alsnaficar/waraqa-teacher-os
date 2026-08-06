import type { NotificationPayload, NotificationProvider } from "../types";

export class EmailProvider implements NotificationProvider {
  async send(_: NotificationPayload): Promise<void> {
    throw new Error("Email Provider is not implemented yet.");
  }
}
