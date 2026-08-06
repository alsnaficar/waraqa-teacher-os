export type NotificationChannel = "app" | "whatsapp" | "email";

export type NotificationType =
  "lesson-reminder" | "homework-reminder" | "exam-reminder" | "weekly-plan" | "custom";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;

  channel: NotificationChannel;

  userId: string;

  metadata?: Record<string, unknown>;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}
