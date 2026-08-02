/**
 * Lesson override store — localStorage-backed.
 *
 * Lets the Planner swap a lesson at three scopes without touching the
 * database or schedule provider:
 *   - "day": one specific dated slot
 *   - "future": all upcoming weeks for the same (day, period)
 *   - "distribution": all weeks (used by users with permission)
 *
 * The Planner reads overrides in memory and applies them to
 * ScheduleEntry rows returned by the provider.
 */

import type { ScheduleDayKey, ScheduleEntry } from "@/features/planner/types";

export type LessonOverrideScope = "day" | "future" | "distribution";

interface DayOverride {
  scope: "day";
  gregorianDate: string;
  period: number;
  title: string;
}
interface FutureOverride {
  scope: "future";
  fromGregorianDate: string;
  day: ScheduleDayKey;
  period: number;
  title: string;
}
interface DistributionOverride {
  scope: "distribution";
  day: ScheduleDayKey;
  period: number;
  title: string;
}

export type LessonOverride = DayOverride | FutureOverride | DistributionOverride;

const KEY = "planner:lesson-overrides:v1";

function read(): LessonOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LessonOverride[]) : [];
  } catch {
    return [];
  }
}

function write(list: LessonOverride[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

export function loadOverrides(): LessonOverride[] {
  return read();
}

export function addOverride(o: LessonOverride): LessonOverride[] {
  const list = read();
  // For day scope, replace any existing day override for the same slot.
  const filtered = list.filter((x) => {
    if (o.scope === "day" && x.scope === "day") {
      return !(x.gregorianDate === o.gregorianDate && x.period === o.period);
    }
    if (o.scope === "distribution" && x.scope === "distribution") {
      return !(x.day === o.day && x.period === o.period);
    }
    return true;
  });
  filtered.push(o);
  write(filtered);
  return filtered;
}

/** Apply overrides to a set of schedule entries. Day > Future > Distribution. */
export function applyOverrides(
  entries: ScheduleEntry[],
  overrides: LessonOverride[],
): ScheduleEntry[] {
  return entries.map((e) => {
    const dayHit = overrides.find(
      (o): o is DayOverride =>
        o.scope === "day" && o.gregorianDate === e.gregorianDate && o.period === e.period,
    );
    if (dayHit) return { ...e, lessonTitle: dayHit.title };

    const futureHit = overrides
      .filter(
        (o): o is FutureOverride =>
          o.scope === "future" && o.day === e.day && o.period === e.period,
      )
      .filter((o) => e.gregorianDate >= o.fromGregorianDate)
      .sort((a, b) => (a.fromGregorianDate < b.fromGregorianDate ? 1 : -1))[0];
    if (futureHit) return { ...e, lessonTitle: futureHit.title };

    const distHit = overrides.find(
      (o): o is DistributionOverride =>
        o.scope === "distribution" && o.day === e.day && o.period === e.period,
    );
    if (distHit) return { ...e, lessonTitle: distHit.title };

    return e;
  });
}
