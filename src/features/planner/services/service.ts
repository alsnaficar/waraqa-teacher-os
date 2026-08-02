/**
 * Schedule service — single entry point for the Planner.
 *
 * Consumers call `getScheduleService()` and never reference a specific
 * provider. Swapping to Google Drive later is a one-line change here.
 */

import { GoogleDriveScheduleProvider } from "../providers/google-drive";
import { MockScheduleProvider } from "../providers/mock";
import type { ScheduleProvider, ScheduleProviderId } from "../types";

const DEFAULT_PROVIDER: ScheduleProviderId = "mock";

let cached: ScheduleProvider | undefined;

export function getScheduleService(
  provider: ScheduleProviderId = DEFAULT_PROVIDER,
): ScheduleProvider {
  if (cached && cached.id === provider) return cached;

  switch (provider) {
    case "mock":
      cached = new MockScheduleProvider();
      return cached;
    case "google-drive":
      cached = new GoogleDriveScheduleProvider();
      return cached;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown schedule provider: ${String(_exhaustive)}`);
    }
  }
}

export type {
  GetDayOptions,
  GetWeekOptions,
  ScheduleDayKey,
  ScheduleEntry,
  ScheduleProvider,
  ScheduleProviderId,
} from "../types";
