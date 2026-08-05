import { ScheduleEngine, NotificationEngine } from "@/core";

import { DashboardService } from "@/services/dashboard";

export const scheduleEngine = new ScheduleEngine();

export const notificationEngine = new NotificationEngine();

export const dashboardService = new DashboardService(scheduleEngine, notificationEngine);
