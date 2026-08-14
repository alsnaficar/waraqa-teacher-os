import { NotificationEngine, ScheduleEngine } from "@/core";

export interface DashboardSummary {
  todayLessons: number;
  preparedLessons: number;
  remainingLessons: number;
  notifications: number;
}

export class DashboardService {
  constructor(
    private readonly schedule: ScheduleEngine,
    private readonly notifications: NotificationEngine,
  ) {}

  getSummary(): DashboardSummary {
    const lessons = this.schedule.all();
    const prepared = lessons.filter((l) => l.prepared).length;

    return {
      todayLessons: lessons.length,
      preparedLessons: prepared,
      remainingLessons: lessons.length - prepared,
      notifications: this.notifications.all().length,
    };
  }
}
