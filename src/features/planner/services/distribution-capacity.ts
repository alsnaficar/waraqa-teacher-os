/**
 * Read-only semester-plan capacity for distribution preview.
 * Uses the same teaching-slot rules as the planner, without schedule generation
 * and without writing planner_entries or lesson_sessions.
 */

import { assertAdmin } from "../../../platform/auth/assert-admin.ts";
import type { SupabaseUserContext } from "../../../platform/database/supabase/context.ts";

import {
  DISTRIBUTION_CAPACITY_CALENDAR_FAILED_NOTE,
  DISTRIBUTION_CAPACITY_MISSING_SCOPE_NOTE,
  DISTRIBUTION_CAPACITY_NO_PLAN_NOTE,
  DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE,
  unknownDistributionCapacity,
  withDistributionPlanContext,
  type DistributionCapacity,
  type DistributionDraft,
} from "./distribution-import.logic.ts";
import {
  compareDistributionCapacity,
  resolveDistributionDemand,
} from "./distribution-capacity.logic.ts";
import {
  buildPlanTeachingSlots,
  buildTeachingDates,
  countWeeklyMatchingTimetableSlots,
  loadCalendarConfig,
  parseProfileTimetable,
  type TimetableSlot,
} from "./planner-engine.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type JwtClient = SupabaseUserContext["client"];

interface CapacityPlanRow {
  id: string;
  status: string;
  user_id: string;
  subject: string;
  grade: string;
  academic_year_id: string | null;
  semester_id: string | null;
  calendar_variant_id: string | null;
}

async function loadDraftPlan(client: JwtClient, planId: string): Promise<CapacityPlanRow | null> {
  const { data, error } = await client
    .from("semester_plans")
    .select(
      "id, status, user_id, subject, grade, academic_year_id, semester_id, calendar_variant_id",
    )
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadOwnerTimetable(client: JwtClient, ownerId: string): Promise<TimetableSlot[]> {
  const { data, error } = await client
    .from("teacher_timetable")
    .select("*")
    .eq("teacher_id", ownerId)
    .eq("active", true)
    .order("day_of_week")
    .order("period");
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length > 0) {
    return rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      period: row.period,
      className: row.class_name,
      subject: row.subject,
      grade: row.grade,
    }));
  }

  const { data: profile } = await client
    .from("profiles")
    .select("classes")
    .eq("id", ownerId)
    .maybeSingle();

  return parseProfileTimetable(profile?.classes);
}

function withPlanContext(draft: DistributionDraft, plan: CapacityPlanRow): DistributionDraft {
  return withDistributionPlanContext(draft, {
    academicYearId: plan.academic_year_id,
    semesterId: plan.semester_id,
    semesterPlanId: plan.id,
  });
}

export async function computeDistributionCapacityForPlan(
  context: SupabaseUserContext,
  semesterPlanId: string,
  items: Array<{ periods: number | null }>,
  untrustedClientTotalPeriods?: number,
): Promise<{ capacity: DistributionCapacity; plan: CapacityPlanRow | null }> {
  const demandPeriods = resolveDistributionDemand(items, untrustedClientTotalPeriods);
  const planId = semesterPlanId.trim();
  if (!planId) {
    return {
      capacity: unknownDistributionCapacity(demandPeriods, DISTRIBUTION_CAPACITY_NO_PLAN_NOTE),
      plan: null,
    };
  }

  const plan = await loadDraftPlan(context.client, planId);
  if (!plan || plan.status !== "draft") {
    return {
      capacity: unknownDistributionCapacity(demandPeriods, DISTRIBUTION_CAPACITY_NO_PLAN_NOTE),
      plan: null,
    };
  }

  const subject = plan.subject.trim();
  const grade = plan.grade.trim();
  if (!subject || !grade) {
    return {
      capacity: unknownDistributionCapacity(
        demandPeriods,
        DISTRIBUTION_CAPACITY_MISSING_SCOPE_NOTE,
      ),
      plan,
    };
  }

  let timetable: TimetableSlot[];
  try {
    timetable = await loadOwnerTimetable(context.client, plan.user_id);
  } catch {
    return {
      capacity: unknownDistributionCapacity(demandPeriods, DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE),
      plan,
    };
  }

  if (timetable.length === 0) {
    return {
      capacity: unknownDistributionCapacity(demandPeriods, DISTRIBUTION_CAPACITY_NO_TIMETABLE_NOTE),
      plan,
    };
  }

  try {
    const config = await loadCalendarConfig(context, {
      academic_year_id: plan.academic_year_id,
      semester_id: plan.semester_id,
      calendar_variant_id: plan.calendar_variant_id,
    });
    const schoolDates = buildTeachingDates(config);
    const slots = buildPlanTeachingSlots(schoolDates, timetable, subject, grade);
    return {
      capacity: compareDistributionCapacity(demandPeriods, slots.length, {
        weeklyMatchingSlots: countWeeklyMatchingTimetableSlots(timetable, subject, grade),
        teachingDayCount: schoolDates.filter((day) => !day.isHoliday).length,
      }),
      plan,
    };
  } catch {
    return {
      capacity: unknownDistributionCapacity(
        demandPeriods,
        DISTRIBUTION_CAPACITY_CALENDAR_FAILED_NOTE,
      ),
      plan,
    };
  }
}

export async function attachDistributionCapacity(
  draft: DistributionDraft,
  context: SupabaseUserContext,
  semesterPlanId: string,
): Promise<DistributionDraft> {
  const { capacity, plan } = await computeDistributionCapacityForPlan(
    context,
    semesterPlanId,
    draft.items,
    draft.summary.totalPeriods,
  );
  const withCapacity = { ...draft, capacity };
  if (!plan) {
    return withDistributionPlanContext(withCapacity, null);
  }
  return withPlanContext(withCapacity, plan);
}

export async function attachDistributionCapacityAuthorized(
  adminClient: AdminClient,
  actorId: string,
  jwtContext: SupabaseUserContext,
  draft: DistributionDraft,
  semesterPlanId: string,
): Promise<DistributionDraft> {
  await assertAdmin(adminClient, actorId);
  return attachDistributionCapacity(draft, jwtContext, semesterPlanId);
}

export async function previewDistributionCapacityAuthorized(
  adminClient: AdminClient,
  actorId: string,
  jwtContext: SupabaseUserContext,
  input: {
    semesterPlanId: string;
    items: Array<{ periods: number | null }>;
    totalPeriods?: number;
  },
): Promise<DistributionCapacity> {
  await assertAdmin(adminClient, actorId);
  const { capacity } = await computeDistributionCapacityForPlan(
    jwtContext,
    input.semesterPlanId,
    input.items,
    input.totalPeriods,
  );
  return capacity;
}
