/**
 * Read-side detection of stale operational planner_entries vs the current
 * distribution snapshot. Detection/withholding only — no regenerate, no writes.
 */

import {
  DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE,
  loadCurrentDistributionScheduleLessons,
  planHasDistributionSnapshots,
} from "./distribution-schedule-source.ts";

type SnapshotClient = Parameters<typeof loadCurrentDistributionScheduleLessons>[0];

export type StoredPlannerLiveKind = "allow" | "withhold" | "fail-closed";

export type LoadOrGeneratePlanAction =
  "return-stored" | "return-empty" | "fail-closed" | "continue-generate";

export { DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE };

export function decideStoredPlannerEntriesLive(
  entries: ReadonlyArray<{ distributionSnapshotId?: string | null }>,
  input: {
    hasDistributionSnapshots: boolean;
    currentSnapshotId: string | null;
  },
): StoredPlannerLiveKind {
  if (!input.hasDistributionSnapshots) return "allow";
  if (!input.currentSnapshotId) return "fail-closed";
  if (entries.length === 0) return "allow";
  const mismatch = entries.some(
    (entry) => (entry.distributionSnapshotId ?? null) !== input.currentSnapshotId,
  );
  return mismatch ? "withhold" : "allow";
}

export function nextLoadOrGeneratePlanAction(
  kind: StoredPlannerLiveKind,
  storedCount: number,
): LoadOrGeneratePlanAction {
  if (kind === "fail-closed") return "fail-closed";
  if (kind === "withhold") return "return-empty";
  if (storedCount > 0) return "return-stored";
  return "continue-generate";
}

export function nextLiveDateReadAction(
  kind: StoredPlannerLiveKind,
): "return-stored" | "return-empty" {
  return kind === "allow" ? "return-stored" : "return-empty";
}

export async function resolveStoredPlannerEntriesLive<
  T extends { distributionSnapshotId?: string | null },
>(
  client: SnapshotClient,
  planId: string,
  currentVersion: number,
  entries: T[],
): Promise<{ kind: "allow"; entries: T[] } | { kind: "withhold" } | { kind: "fail-closed" }> {
  const current = await loadCurrentDistributionScheduleLessons(client, planId, currentVersion);
  const hasDistributionSnapshots = current
    ? true
    : await planHasDistributionSnapshots(client, planId);
  const kind = decideStoredPlannerEntriesLive(entries, {
    hasDistributionSnapshots,
    currentSnapshotId: current?.snapshotId ?? null,
  });
  if (kind === "allow") return { kind, entries };
  return { kind };
}
