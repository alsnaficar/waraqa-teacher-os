export type NotificationType =
  "lesson-reminder" | "worksheet-reminder" | "quiz-reminder" | "madrasati-sync" | "teams-meeting";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  scheduledAt: Date;
  sent: boolean;
}

export class NotificationEngine {
  private readonly queue: NotificationItem[] = [];

  schedule(item: NotificationItem) {
    this.queue.push(item);
  }

  all() {
    return this.queue;
  }
}
