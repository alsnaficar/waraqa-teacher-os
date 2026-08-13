/**
 * Read-only lesson source for semester-plan scheduling.
 * Prefers the current distribution snapshot for a plan version.
 * Does not insert snapshots or synthesize them from curriculum_lessons.
 */

import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";

type JwtClient = SupabaseUserContext["client"];

export interface ScheduleSourceLesson {
  id: string | null;
  title: string;
  unitTitle: string;
  periodsCount: number;
  orderIndex: number;
  objectives: string;
  teachingResources: string;
  assessmentMethods: string;
  planNotes: string;
}

export interface DistributionSnapshotItemRow {
  order_index: number;
  unit: string | null;
  lesson: string;
  periods: number;
  notes: string | null;
  curriculum_lesson_id: string | null;
}

export function mapSnapshotItemsToScheduleLessons(
  items: DistributionSnapshotItemRow[],
): ScheduleSourceLesson[] {
  return [...items]
    .filter((item) => item.lesson.trim() && item.periods >= 1 && item.order_index >= 1)
    .sort((a, b) => a.order_index - b.order_index)
    .map((item) => ({
      id: item.curriculum_lesson_id,
      title: item.lesson.trim(),
      unitTitle: (item.unit ?? "").trim(),
      periodsCount: item.periods,
      orderIndex: item.order_index,
      objectives: "",
      teachingResources: "",
      assessmentMethods: "",
      planNotes: (item.notes ?? "").trim(),
    }));
}

/**
 * Loads the current snapshot for the plan's current version.
 * Returns null when no snapshot exists so callers keep the curriculum fallback.
 */
export async function loadCurrentDistributionScheduleLessons(
  client: JwtClient,
  planId: string,
  currentVersion: number,
): Promise<ScheduleSourceLesson[] | null> {
  const { data: version, error: versionError } = await client
    .from("semester_plan_versions")
    .select("id")
    .eq("semester_plan_id", planId)
    .eq("version_number", currentVersion)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version?.id) return null;

  const { data: snapshot, error: snapshotError } = await client
    .from("distribution_snapshots")
    .select("id")
    .eq("semester_plan_id", planId)
    .eq("semester_plan_version_id", version.id)
    .eq("is_current", true)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot?.id) return null;

  const { data: items, error: itemsError } = await client
    .from("distribution_snapshot_items")
    .select("order_index, unit, lesson, periods, notes, curriculum_lesson_id")
    .eq("snapshot_id", snapshot.id)
    .order("order_index", { ascending: true });
  if (itemsError) throw itemsError;
  if (!items?.length) return null;

  const mapped = mapSnapshotItemsToScheduleLessons(items);
  return mapped.length ? mapped : null;
}
