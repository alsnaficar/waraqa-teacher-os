/**
 * Pure approval decision for a distribution snapshot.
 * Does not write DB, call the planner engine, or resolve calendars.
 */

import {
  type DistributionDraft,
  type DistributionDraftItem,
  sumDistributionPeriods,
} from "./distribution-import.logic.ts";

export const DISTRIBUTION_SNAPSHOT_NOT_CONFIRMED_MESSAGE = "لا يُحفظ التوزيع إلا بعد اعتماد صريح.";
export const DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE = "اختر مسودة خطة فصل لحفظ لقطة التوزيع.";
export const DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE =
  "لا يمكن حفظ لقطة التوزيع إلا على خطة بحالة مسودة.";
export const DISTRIBUTION_SNAPSHOT_EMPTY_MESSAGE = "لا توجد عناصر صالحة لحفظ اللقطة.";
export const DISTRIBUTION_SNAPSHOT_HAS_ERRORS_MESSAGE =
  "لا يمكن اعتماد التوزيع بوجود أخطاء. أصلح الورقة ثم أعد القراءة.";
export const DISTRIBUTION_SNAPSHOT_NEEDS_REVIEW_MESSAGE =
  "يوجد عناصر تحتاج مراجعة. أكّد المتابعة قبل حفظ اللقطة.";
export const DISTRIBUTION_SNAPSHOT_VERSION_MISSING_MESSAGE = "إصدار خطة الفصل غير موجود.";
export const DISTRIBUTION_SNAPSHOT_SAVE_FAILED_MESSAGE =
  "تعذر اعتماد لقطة التوزيع. لم يتم حفظ أي تغيير.";

export interface DistributionSnapshotItemInput {
  orderIndex: number;
  unit: string;
  lesson: string;
  periods: number;
  notes: string;
  curriculumLessonId: string | null;
}

export interface DistributionSnapshotApprovalInput {
  draft: DistributionDraft;
  semesterPlanId?: string | null;
  planStatus?: string | null;
  confirmed: boolean;
  acknowledgeWarnings: boolean;
}

export type DistributionSnapshotApprovalDecision =
  | {
      ok: true;
      semesterPlanId: string;
      items: DistributionSnapshotItemInput[];
      totalPeriods: number;
    }
  | {
      ok: false;
      errors: string[];
    };

function isSavableItem(item: DistributionDraftItem): boolean {
  return Boolean(
    item.order != null &&
    item.order >= 1 &&
    item.lesson.trim() &&
    item.periods != null &&
    item.periods >= 1,
  );
}

function toSnapshotItem(item: DistributionDraftItem): DistributionSnapshotItemInput {
  return {
    orderIndex: item.order as number,
    unit: item.unit.trim(),
    lesson: item.lesson.trim(),
    periods: item.periods as number,
    notes: item.notes.trim(),
    curriculumLessonId: item.curriculumMatch === "matched" ? item.curriculumLessonId : null,
  };
}

export function decideDistributionSnapshotApproval(
  input: DistributionSnapshotApprovalInput,
): DistributionSnapshotApprovalDecision {
  const errors: string[] = [];
  if (!input.confirmed) {
    errors.push(DISTRIBUTION_SNAPSHOT_NOT_CONFIRMED_MESSAGE);
  }

  const semesterPlanId = input.semesterPlanId?.trim() || "";
  if (!semesterPlanId) {
    errors.push(DISTRIBUTION_SNAPSHOT_MISSING_PLAN_MESSAGE);
  }

  if (semesterPlanId && input.planStatus && input.planStatus !== "draft") {
    errors.push(DISTRIBUTION_SNAPSHOT_PLAN_NOT_DRAFT_MESSAGE);
  }

  if (input.draft.errors.length > 0 || input.draft.summary.errorCount > 0) {
    errors.push(DISTRIBUTION_SNAPSHOT_HAS_ERRORS_MESSAGE);
  }

  const hasReview = input.draft.items.some((item) => item.status === "needs_review");
  if (hasReview && !input.acknowledgeWarnings) {
    errors.push(DISTRIBUTION_SNAPSHOT_NEEDS_REVIEW_MESSAGE);
  }

  const candidates = input.draft.items.filter((item) => {
    if (item.status === "error") return false;
    if (item.status === "needs_review" && !input.acknowledgeWarnings) return false;
    return isSavableItem(item);
  });

  if (!candidates.length) {
    errors.push(DISTRIBUTION_SNAPSHOT_EMPTY_MESSAGE);
  }

  if (errors.length) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const items = candidates.map(toSnapshotItem);
  return {
    ok: true,
    semesterPlanId,
    items,
    totalPeriods: sumDistributionPeriods(
      candidates.map((item) => ({
        ...item,
        periods: item.periods,
      })),
    ),
  };
}
