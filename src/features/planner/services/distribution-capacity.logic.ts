/**
 * Pure capacity comparison for distribution preview.
 * Does not load DB, generate a schedule, or write planner_entries.
 */

import {
  DISTRIBUTION_CAPACITY_DEFICIT_NOTE,
  DISTRIBUTION_CAPACITY_FIT_NOTE,
  DISTRIBUTION_CAPACITY_SURPLUS_NOTE,
  unknownDistributionCapacity,
  type DistributionCapacity,
} from "./distribution-import.logic.ts";

export function compareDistributionCapacity(
  demandPeriods: number,
  availableSlots: number,
  extras?: {
    weeklyMatchingSlots?: number;
    teachingDayCount?: number;
  },
): DistributionCapacity {
  if (
    demandPeriods < 0 ||
    availableSlots < 0 ||
    !Number.isFinite(demandPeriods) ||
    !Number.isFinite(availableSlots)
  ) {
    return unknownDistributionCapacity(Math.max(0, demandPeriods || 0));
  }

  const delta = availableSlots - demandPeriods;
  const comparison = delta > 0 ? "surplus" : delta < 0 ? "deficit" : "fit";
  const note =
    comparison === "fit"
      ? DISTRIBUTION_CAPACITY_FIT_NOTE
      : comparison === "surplus"
        ? DISTRIBUTION_CAPACITY_SURPLUS_NOTE
        : DISTRIBUTION_CAPACITY_DEFICIT_NOTE;

  return {
    totalPeriods: demandPeriods,
    availableSlots,
    status: "known",
    note,
    delta,
    comparison,
    weeklyMatchingSlots: extras?.weeklyMatchingSlots ?? null,
    teachingDayCount: extras?.teachingDayCount ?? null,
  };
}
