import { supabase } from "@/integrations/supabase/client";
import { deserializeLessonNotes } from "@/lib/curriculum-management.functions";

export interface AcademicCalendarConfig {
  academicYear: string;
  semesterId: string;
  semesterStart: string; // YYYY-MM-DD
  semesterEnd: string; // YYYY-MM-DD
  teachingWeeksCount: number;
  periodsPerDay: number;
  workingDays: number[]; // e.g. [0, 1, 2, 3, 4] for Sun-Thu
  holidays: Array<{ date: string; label: string }>;
  examWeeks: number[]; // Week numbers when exams are held, e.g. [14, 15]
}

export interface TimetableSlot {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  period: number; // 1-based period number
  className: string; // e.g., "5-أ" or "1/أ"
}

export type OverrideType = "skip" | "swap" | "move" | "insert";

export interface ScheduleOverride {
  id: string;
  type: OverrideType;
  lessonId?: string; // ID of the curriculum_lessons entry
  lessonIdA?: string; // For swaps
  lessonIdB?: string; // For swaps
  targetDate?: string; // For move / insert (YYYY-MM-DD)
  targetPeriod?: number; // For move / insert
  customTitle?: string; // For insert
  customUnit?: string; // For insert
  periodsCount?: number; // For insert
}

export interface CalculatedLessonEntry {
  id: string; // unique ID
  academicYear: string;
  semester: string;
  weekNumber: number; // overall academic week
  teachingWeek: number; // week excluding holidays/exams
  suggestedDate: string; // YYYY-MM-DD
  dayOfWeek: number;
  period: number;
  unit: string;
  lessonId: string | null; // null for custom inserts
  lessonTitle: string;
  lessonOrder: number;
  periodsCount: number;
  remainingPeriods: number;
  status: "Upcoming" | "Current" | "Completed" | "Skipped";
  className: string;
  subject: string;
}

// Fallback / default configs to ensure zero-cold-start
export const CONFIG_ACADEMIC_CALENDAR_DATE = "1970-01-01";
export const CONFIG_SCHEDULE_OVERRIDES_DATE = "1970-01-02";

export const DEFAULT_CALENDAR: AcademicCalendarConfig = {
  academicYear: "1447",
  semesterId: "s1",
  semesterStart: "2026-08-30",
  semesterEnd: "2026-12-10",
  teachingWeeksCount: 15,
  periodsPerDay: 7,
  workingDays: [0, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu
  holidays: [
    { date: "2026-09-23", label: "اليوم الوطني للمملكة العربية السعودية" },
    { date: "2026-11-09", label: "إجازة نهاية أسبوع مطولة" },
    { date: "2026-11-10", label: "إجازة نهاية أسبوع مطولة" },
  ],
  examWeeks: [14, 15],
};

const DEFAULT_TIMETABLE: TimetableSlot[] = [
  { dayOfWeek: 0, period: 1, className: "أول متوسط - 1" }, // Sun Period 1
  { dayOfWeek: 1, period: 3, className: "أول متوسط - 1" }, // Mon Period 3
  { dayOfWeek: 3, period: 2, className: "أول متوسط - 1" }, // Wed Period 2
  { dayOfWeek: 4, period: 4, className: "أول متوسط - 1" }, // Thu Period 4
];

/**
 * Loads the active academic calendar config from the DB.
 * Uses a special database row in planner_entries to maintain single source of truth without schema edits.
 */
export async function loadCalendarConfig(): Promise<AcademicCalendarConfig> {
  try {
    const { data, error } = await supabase
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_ACADEMIC_CALENDAR_DATE)
      .maybeSingle();

    if (error || !data?.notes) {
      return DEFAULT_CALENDAR;
    }
    return JSON.parse(data.notes) as AcademicCalendarConfig;
  } catch (err) {
    console.warn("Failed to load calendar config, using default:", err);
    return DEFAULT_CALENDAR;
  }
}

/**
 * Saves the academic calendar config globally to Supabase.
 */
export async function saveCalendarConfig(config: AcademicCalendarConfig): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Upsert config into planner_entries with special identifier
  const { error } = await supabase.from("planner_entries").upsert({
    id: "00000000-0000-0000-0000-000000000000", // Fixed UUID for config
    user_id: user.id,
    week_start_date: CONFIG_ACADEMIC_CALENDAR_DATE,
    day_of_week: -1,
    period: -1,
    subject: "CONFIG",
    notes: JSON.stringify(config),
  });

  if (error) throw error;
}

/**
 * Loads the weekly timetable configuration for the current teacher.
 */
export async function loadTimetable(): Promise<TimetableSlot[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_TIMETABLE;

    const { data, error } = await supabase
      .from("profiles")
      .select("classes")
      .eq("id", user.id)
      .single();

    if (error || !data?.classes) {
      return DEFAULT_TIMETABLE;
    }

    const classesJson = data.classes as Record<string, unknown> | null;
    if (classesJson && Array.isArray(classesJson.timetable)) {
      return classesJson.timetable as TimetableSlot[];
    }
    return DEFAULT_TIMETABLE;
  } catch (err) {
    console.warn("Failed to load timetable, using default:", err);
    return DEFAULT_TIMETABLE;
  }
}

/**
 * Saves the weekly timetable configuration for the current teacher.
 */
export async function saveTimetable(timetable: TimetableSlot[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("classes")
    .eq("id", user.id)
    .single();

  const currentClasses = (profile?.classes as Record<string, unknown>) || {};
  const updatedClasses = {
    ...currentClasses,
    timetable,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ classes: updatedClasses })
    .eq("id", user.id);

  if (error) throw error;
}

/**
 * Loads all overrides for the current teacher.
 */
export async function loadUserOverrides(): Promise<ScheduleOverride[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data?.notes) return [];
    return JSON.parse(data.notes) as ScheduleOverride[];
  } catch (err) {
    console.warn("Failed to load overrides:", err);
    return [];
  }
}

/**
 * Saves overrides list for the current teacher.
 */
export async function saveUserOverrides(overrides: ScheduleOverride[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("planner_entries").upsert({
    id: "11111111-1111-1111-1111-111111111111", // Fixed UUID for user overrides
    user_id: user.id,
    week_start_date: CONFIG_SCHEDULE_OVERRIDES_DATE,
    day_of_week: -1,
    period: -1,
    subject: "OVERRIDES",
    notes: JSON.stringify(overrides),
  });

  if (error) throw error;
}

/**
 * Generates the clean calendar schedule list of slots, skipping holidays and exam weeks.
 */
export function buildTeachingDates(config: AcademicCalendarConfig): Array<{
  date: string; // YYYY-MM-DD
  weekNumber: number;
  teachingWeek: number;
  dayOfWeek: number;
  isHoliday: boolean;
  isExamWeek: boolean;
  holidayLabel?: string;
}> {
  const dates: Array<{
    date: string;
    weekNumber: number;
    teachingWeek: number;
    dayOfWeek: number;
    isHoliday: boolean;
    isExamWeek: boolean;
    holidayLabel?: string;
  }> = [];

  const start = new Date(config.semesterStart);
  const end = new Date(config.semesterEnd);

  const current = new Date(start);
  let teachingWeekCounter = 1;

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const isSchoolDay = config.workingDays.includes(dayOfWeek);

    const isoDate = current.toISOString().slice(0, 10);
    const msDiff = current.getTime() - start.getTime();
    const weekNumber = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;

    const isExamWeek = config.examWeeks.includes(weekNumber);
    const holidayHit = config.holidays.find((h) => h.date === isoDate);
    const isHoliday = !!holidayHit;

    // Determine teaching week increment
    // If it's a new week start and not an exam week or fully holiday, we increment.
    // To keep it simple, teaching week maps to academic week unless skipped.
    if (dayOfWeek === config.workingDays[0] && isSchoolDay) {
      if (isExamWeek) {
        // Exam weeks don't count towards teaching weeks
      } else {
        // Check if there's at least one teaching day in this week
        teachingWeekCounter = weekNumber;
      }
    }

    if (isSchoolDay) {
      dates.push({
        date: isoDate,
        weekNumber,
        teachingWeek: isExamWeek ? 0 : teachingWeekCounter,
        dayOfWeek,
        isHoliday,
        isExamWeek,
        holidayLabel: holidayHit?.label,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * The Smart Scheduler Engine.
 * Combines Published Curriculum Lessons + Calendar Config + Teacher Timetable + Overrides.
 * Produces the final sequential calculated schedule.
 */
export async function generateSchedule(
  subject?: string,
  grade?: string,
): Promise<CalculatedLessonEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Fetch teacher's primary profile to see what grade & subject they teach
  const { data: profile } = await supabase
    .from("profiles")
    .select("grade, subject, classes")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return [];
  }

  let activeSubject = subject || profile.subject;
  let activeGrade = grade || profile.grade;

  if (!subject && !grade && profile.classes) {
    const classes = profile.classes as Record<string, unknown>;
    if (Array.isArray(classes.assignments) && classes.assignments.length > 0) {
      const firstAssignment = classes.assignments[0] as Record<string, unknown>;
      if (firstAssignment) {
        activeSubject = (firstAssignment.subject as string) || activeSubject;
        activeGrade = (firstAssignment.grade as string) || activeGrade;
      }
    }
  }

  if (!activeSubject || !activeGrade) {
    return [];
  }

  // 2. Fetch the published curriculum file for this grade & subject
  const { data: files } = await supabase
    .from("curriculum_files")
    .select("id")
    .eq("grade", activeGrade)
    .eq("subject", activeSubject)
    .eq("status", "published")
    .limit(1);

  const publishedFileId = files?.[0]?.id;

  if (!publishedFileId) {
    return [];
  }

  let parsedLessons: Array<{
    id: string | null;
    title: string;
    unitTitle: string;
    periodsCount: number;
    orderIndex: number;
  }> = [];

  // 3. Fetch all curriculum lessons for this file
  const { data: lessons, error: lessonsError } = await supabase
    .from("curriculum_lessons")
    .select("*")
    .eq("curriculum_file_id", publishedFileId)
    .order("order_index", { ascending: true });

  if (lessonsError || !lessons || lessons.length === 0) {
    return [];
  }

  // Deserialise and index the curriculum lessons
  parsedLessons = lessons.map((l) => {
    const extra = deserializeLessonNotes(l.notes);
    return {
      id: l.id,
      title: l.title,
      unitTitle: extra.unitName || "الوحدة الأولى",
      periodsCount: Math.max(1, parseInt(extra.periods || "1", 10)),
      orderIndex: l.order_index,
    };
  });

  // 4. Load config, timetable and overrides
  const config = await loadCalendarConfig();
  const timetable = await loadTimetable();
  const overrides = await loadUserOverrides();

  // 5. Generate all school days inside the semester
  const schoolDates = buildTeachingDates(config);

  // 6. Build the list of available teaching slots sequentially
  const teachingSlots: Array<{
    date: string;
    weekNumber: number;
    teachingWeek: number;
    dayOfWeek: number;
    period: number;
    className: string;
  }> = [];

  for (const day of schoolDates) {
    // Skip holidays and exam weeks
    if (day.isHoliday || day.isExamWeek) continue;

    // Find timetable slots for this day of week
    const slotsForDay = timetable.filter((t) => t.dayOfWeek === day.dayOfWeek);
    // Sort slots by period ascending
    slotsForDay.sort((a, b) => a.period - b.period);

    for (const slot of slotsForDay) {
      teachingSlots.push({
        date: day.date,
        weekNumber: day.weekNumber,
        teachingWeek: day.teachingWeek,
        dayOfWeek: day.dayOfWeek,
        period: slot.period,
        className: slot.className,
      });
    }
  }

  // 7. Prepare the curriculum lessons list, applying overrides (skips, swaps, etc.)
  const activeLessons = [...parsedLessons];

  // Apply SWAP overrides first
  for (const o of overrides) {
    if (o.type === "swap" && o.lessonIdA && o.lessonIdB) {
      const idxA = activeLessons.findIndex((l) => l.id === o.lessonIdA);
      const idxB = activeLessons.findIndex((l) => l.id === o.lessonIdB);
      if (idxA !== -1 && idxB !== -1) {
        const temp = activeLessons[idxA];
        activeLessons[idxA] = activeLessons[idxB];
        activeLessons[idxB] = temp;
      }
    }
  }

  // Apply SKIP overrides (exclude them from sequential distribution)
  const skippedIds = new Set(
    overrides.filter((o) => o.type === "skip" && o.lessonId).map((o) => o.lessonId!),
  );
  const nonSkippedLessons = activeLessons.filter((l) => !skippedIds.has(l.id));

  // Flatten the lessons based on periods count.
  // For example, if a lesson takes 2 periods, it gets split into:
  // slot 1: Lesson Title (Period 1 of 2)
  // slot 2: Lesson Title (Period 2 of 2)
  interface FlatLesson {
    id: string | null; // null if custom insert
    title: string;
    unit: string;
    lessonOrder: number;
    periodsCount: number;
    remainingPeriods: number;
    isCustom: boolean;
  }

  const flatLessons: FlatLesson[] = [];
  let lessonOrderCounter = 1;

  for (const l of nonSkippedLessons) {
    for (let p = 0; p < l.periodsCount; p++) {
      flatLessons.push({
        id: l.id,
        title: l.periodsCount > 1 ? `${l.title} (جزء ${p + 1})` : l.title,
        unit: l.unitTitle,
        lessonOrder: lessonOrderCounter,
        periodsCount: l.periodsCount,
        remainingPeriods: l.periodsCount - p - 1,
        isCustom: false,
      });
    }
    lessonOrderCounter++;
  }

  // Apply INSERT overrides (place custom lessons at specific slots)
  const inserts = overrides.filter((o) => o.type === "insert" && o.targetDate && o.targetPeriod);

  // 8. Map flat lessons and custom inserts onto available teaching slots
  const calculatedEntries: CalculatedLessonEntry[] = [];
  let flatLessonIdx = 0;

  for (let slotIdx = 0; slotIdx < teachingSlots.length; slotIdx++) {
    const slot = teachingSlots[slotIdx];

    // Check if there is an INSERT override for this exact slot
    const insertHit = inserts.find(
      (o) => o.targetDate === slot.date && o.targetPeriod === slot.period,
    );

    if (insertHit) {
      calculatedEntries.push({
        id: `insert-${slot.date}-${slot.period}`,
        academicYear: config.academicYear,
        semester: config.semesterId,
        weekNumber: slot.weekNumber,
        teachingWeek: slot.teachingWeek,
        suggestedDate: slot.date,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        unit: insertHit.customUnit || "حصص مخصصة",
        lessonId: null,
        lessonTitle: insertHit.customTitle || "درس مخصص",
        lessonOrder: 0,
        periodsCount: 1,
        remainingPeriods: 0,
        status: "Upcoming",
        className: slot.className,
        subject: activeSubject,
      });
      continue;
    }

    // Check if there is a MOVE override targeting this slot
    const moveHit = overrides.find(
      (o) => o.type === "move" && o.targetDate === slot.date && o.targetPeriod === slot.period,
    );

    if (moveHit && moveHit.lessonId) {
      const originalLesson = parsedLessons.find((l) => l.id === moveHit.lessonId);
      if (originalLesson) {
        calculatedEntries.push({
          id: `move-${slot.date}-${slot.period}`,
          academicYear: config.academicYear,
          semester: config.semesterId,
          weekNumber: slot.weekNumber,
          teachingWeek: slot.teachingWeek,
          suggestedDate: slot.date,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          unit: originalLesson.unitTitle,
          lessonId: originalLesson.id,
          lessonTitle: `[منقول] ${originalLesson.title}`,
          lessonOrder: originalLesson.orderIndex + 1,
          periodsCount: originalLesson.periodsCount,
          remainingPeriods: 0,
          status: "Upcoming",
          className: slot.className,
          subject: activeSubject,
        });
        // Skip placing regular flat lesson on this slot
        continue;
      }
    }

    // Regular sequential distribution
    if (flatLessonIdx < flatLessons.length) {
      const lesson = flatLessons[flatLessonIdx];
      calculatedEntries.push({
        id: `${lesson.id || "custom"}-${slot.date}-${slot.period}`,
        academicYear: config.academicYear,
        semester: config.semesterId,
        weekNumber: slot.weekNumber,
        teachingWeek: slot.teachingWeek,
        suggestedDate: slot.date,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        unit: lesson.unit,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonOrder: lesson.lessonOrder,
        periodsCount: lesson.periodsCount,
        remainingPeriods: lesson.remainingPeriods,
        status: "Upcoming",
        className: slot.className,
        subject: activeSubject,
      });
      flatLessonIdx++;
    }
  }

  // 9. Update the STATUS of each entry dynamically based on suggestedDate vs today
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const entry of calculatedEntries) {
    // Check if user manually marked skipped or completed in overrides (or set default based on date)
    const isExplicitSkipped = skippedIds.has(entry.lessonId || "");
    if (isExplicitSkipped) {
      entry.status = "Skipped";
    } else if (entry.suggestedDate < todayISO) {
      entry.status = "Completed";
    } else if (entry.suggestedDate === todayISO) {
      entry.status = "Current";
    } else {
      entry.status = "Upcoming";
    }
  }

  return calculatedEntries;
}

/**
 * Saves/updates generated planner entries to the `planner_entries` database table.
 */
export async function syncScheduleToDatabase(
  entries: CalculatedLessonEntry[],
  subject?: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 1. Delete old regular calculated entries to prevent duplication
  // Regular calculated entries have week_start_date NOT equal to config markers
  let query = supabase
    .from("planner_entries")
    .delete()
    .eq("user_id", user.id)
    .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
    .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE);

  if (subject) {
    query = query.eq("subject", subject);
  }

  const { error: deleteError } = await query;

  if (deleteError) throw deleteError;

  if (entries.length === 0) return;

  // 2. Insert new generated entries in batches of 100 for safety and performance
  const batchSize = 100;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize).map((e) => {
      // Find Sunday week_start_date for the suggestedDate
      const d = new Date(e.suggestedDate);
      const day = d.getDay();
      const diff = d.getDate() - day; // Adjust to Sunday
      const sun = new Date(d.setDate(diff));
      const weekStart = sun.toISOString().slice(0, 10);

      return {
        id: crypto.randomUUID(),
        user_id: user.id,
        week_start_date: weekStart,
        day_of_week: e.dayOfWeek,
        period: e.period,
        subject: e.subject,
        notes: JSON.stringify(e),
      };
    });

    const { error: insertError } = await supabase.from("planner_entries").insert(batch);
    if (insertError) throw insertError;
  }
}

/**
 * Triggers full recalculation & synchronization of the Smart Planner schedule.
 */
export async function recalculateAndSyncPlanner(
  subject?: string,
  grade?: string,
): Promise<CalculatedLessonEntry[]> {
  const calculated = await generateSchedule(subject, grade);
  await syncScheduleToDatabase(calculated, subject || calculated[0]?.subject);
  return calculated;
}
