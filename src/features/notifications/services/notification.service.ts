import { AppProvider } from "../providers/app.provider";
import { EmailProvider } from "../providers/email.provider";
import { WhatsAppProvider } from "../providers/whatsapp.provider";

import type { NotificationChannel, NotificationPayload, NotificationProvider } from "../types";

export class NotificationService {
  private readonly providers: Record<NotificationChannel, NotificationProvider> = {
    app: new AppProvider(),
    whatsapp: new WhatsAppProvider(),
    email: new EmailProvider(),
  };

  async send(payload: NotificationPayload): Promise<void> {
    const provider = this.providers[payload.channel];

    if (!provider) {
      throw new Error(`Unsupported notification channel: ${payload.channel}`);
    }

    await provider.send(payload);
  }
}

export const notificationService = new NotificationService();
