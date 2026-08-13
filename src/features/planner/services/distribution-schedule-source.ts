/**
 * Read-only lesson source for semester-plan scheduling.
 * Prefers the current distribution snapshot for a plan version.
 * Does not insert snapshots or synthesize them from curriculum_lessons.
 *
 * Distribution-based vs legacy is detected from existing rows only:
 * any `distribution_snapshots` row for the plan means the plan already
 * entered the distribution pipeline. No new column is required.
 */

import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";

type JwtClient = SupabaseUserContext["client"];

export const DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE =
  "لا توجد لقطة توزيع معتمدة للإصدار الحالي من الخطة. أعد استيراد التوزيع واعتماده قبل توليد الخطة.";

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

export interface CurrentDistributionSchedule {
  snapshotId: string;
  lessons: ScheduleSourceLesson[];
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
 * True when this plan already has at least one distribution snapshot
 * on any version. That is the existing signal that the plan is
 * distribution-based rather than a legacy curriculum plan.
 */
export async function planHasDistributionSnapshots(
  client: JwtClient,
  planId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("distribution_snapshots")
    .select("id")
    .eq("semester_plan_id", planId)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

/**
 * Loads the current snapshot for the plan's current version only.
 * Bound to semester_plan_id + current version id + is_current = true.
 * Returns null when that exact snapshot is missing or has no valid items.
 * Does not fall back to an older version or to curriculum_lessons.
 */
export async function loadCurrentDistributionScheduleLessons(
  client: JwtClient,
  planId: string,
  currentVersion: number,
): Promise<CurrentDistributionSchedule | null> {
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
  return mapped.length ? { snapshotId: snapshot.id, lessons: mapped } : null;
}

/**
 * Lesson source for generateSchedule.
 *
 * CASE C: current version has a current snapshot with valid items → use it.
 * CASE A/B/empty: plan already used the distribution pipeline, but the
 * current version has no valid current snapshot → fail-closed.
 * CASE D: plan has never had a distribution snapshot → null so the caller
 * keeps the published curriculum_lessons path.
 */
export async function resolveDistributionScheduleLessons(
  client: JwtClient,
  planId: string,
  currentVersion: number,
): Promise<CurrentDistributionSchedule | null> {
  const current = await loadCurrentDistributionScheduleLessons(client, planId, currentVersion);
  if (current?.lessons.length) return current;

  if (await planHasDistributionSnapshots(client, planId)) {
    throw new Error(DISTRIBUTION_SNAPSHOT_REQUIRED_MESSAGE);
  }

  return null;
}
