/**
 * Google Drive schedule provider.
 *
 * Reads a spreadsheet from Drive (via a server function that calls the
 * Google Sheets API), converts rows into ScheduleEntry[], validates the
 * required columns, ignores empty rows, and gracefully falls back to the
 * mock provider whenever Drive is unavailable or the sheet is invalid.
 *
 * Expected header row (case-insensitive, any order):
 *   hijri_date, gregorian_date, week, day, stage, grade,
 *   subject, period, lesson_title, class (optional)
 */

import { fetchDriveScheduleRows } from "../drive.functions";
import { startOfWeekSunday, addDays } from "@/shared/utils/date";
import type { EducationStage } from "@/features/ai/components/curriculum-selector";
import type {
  GetDayOptions,
  GetWeekOptions,
  ScheduleDayKey,
  ScheduleEntry,
  ScheduleProvider,
} from "../types";
import { MockScheduleProvider } from "./mock";

const REQUIRED_COLUMNS = [
  "hijri_date",
  "gregorian_date",
  "week",
  "day",
  "stage",
  "grade",
  "subject",
  "period",
  "lesson_title",
] as const;

const DAY_ALIASES: Record<string, ScheduleDayKey> = {
  sun: "sun",
  sunday: "sun",
  الأحد: "sun",
  الاحد: "sun",
  mon: "mon",
  monday: "mon",
  الإثنين: "mon",
  الاثنين: "mon",
  tue: "tue",
  tuesday: "tue",
  الثلاثاء: "tue",
  wed: "wed",
  wednesday: "wed",
  الأربعاء: "wed",
  الاربعاء: "wed",
  thu: "thu",
  thursday: "thu",
  الخميس: "thu",
};

const STAGE_ALIASES: Record<string, EducationStage> = {
  primary: "primary",
  ابتدائي: "primary",
  الابتدائي: "primary",
  intermediate: "intermediate",
  متوسط: "intermediate",
  المتوسط: "intermediate",
  secondary: "secondary",
  ثانوي: "secondary",
  الثانوي: "secondary",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseRows(rows: string[][]): ScheduleEntry[] {
  if (!rows.length) throw new Error("empty_sheet");
  const [header, ...body] = rows;
  const cols = header.map(normalizeHeader);
  const idx: Record<string, number> = {};
  for (const key of REQUIRED_COLUMNS) idx[key] = cols.indexOf(key);
  const classIdx = cols.indexOf("class");

  const missing = REQUIRED_COLUMNS.filter((k) => idx[k] === -1);
  if (missing.length) throw new Error(`missing_columns:${missing.join(",")}`);

  const entries: ScheduleEntry[] = [];
  for (const row of body) {
    if (!row || row.every((c) => !c || !String(c).trim())) continue;
    const dayRaw = String(row[idx.day] ?? "").trim();
    const stageRaw = String(row[idx.stage] ?? "").trim();
    const day = DAY_ALIASES[dayRaw.toLowerCase()] ?? DAY_ALIASES[dayRaw];
    const stage = STAGE_ALIASES[stageRaw.toLowerCase()] ?? STAGE_ALIASES[stageRaw];
    const week = Number(row[idx.week]);
    const period = Number(row[idx.period]);
    const gregorianDate = String(row[idx.gregorian_date] ?? "").trim();
    const hijriDate = String(row[idx.hijri_date] ?? "").trim();
    const grade = String(row[idx.grade] ?? "").trim();
    const subject = String(row[idx.subject] ?? "").trim();
    const lessonTitle = String(row[idx.lesson_title] ?? "").trim();

    if (!day || !stage || !gregorianDate || !grade || !subject || !lessonTitle) continue;
    if (!Number.isFinite(week) || !Number.isFinite(period)) continue;

    entries.push({
      id: `${gregorianDate}-p${period}-${entries.length}`,
      hijriDate,
      gregorianDate,
      week,
      day,
      stage,
      grade,
      subject,
      period,
      lessonTitle,
      klass: classIdx >= 0 ? String(row[classIdx] ?? "").trim() || undefined : undefined,
    });
  }
  return entries;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class GoogleDriveScheduleProvider implements ScheduleProvider {
  readonly id = "google-drive" as const;
  private fallback = new MockScheduleProvider();
  private cache?: { at: number; entries: ScheduleEntry[] };
  private readonly ttlMs = 5 * 60 * 1000;

  private async loadAll(): Promise<ScheduleEntry[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.entries;
    }
    try {
      const res = await fetchDriveScheduleRows();
      if (!res.ok || !res.rows) {
        console.warn(`[schedule/drive] Falling back to mock (${res.reason ?? "unknown"}).`);
        return [];
      }
      const entries = parseRows(res.rows);
      console.info(`[schedule/drive] Parsed ${entries.length} schedule entries.`);
      this.cache = { at: Date.now(), entries };
      return entries;
    } catch (err) {
      console.warn("[schedule/drive] Parse failed, falling back to mock:", err);
      return [];
    }
  }

  async getWeek(options: GetWeekOptions): Promise<ScheduleEntry[]> {
    const all = await this.loadAll();
    if (!all.length) return this.fallback.getWeek(options);
    const start = iso(startOfWeekSunday(options.weekOf));
    const end = iso(addDays(startOfWeekSunday(options.weekOf), 5));
    const filtered = all.filter((e) => e.gregorianDate >= start && e.gregorianDate < end);
    return filtered.length ? filtered : this.fallback.getWeek(options);
  }

  async getDay(options: GetDayOptions): Promise<ScheduleEntry[]> {
    const all = await this.loadAll();
    if (!all.length) return this.fallback.getDay(options);
    const target = iso(options.gregorianDate);
    const filtered = all.filter((e) => e.gregorianDate === target);
    return filtered.length ? filtered : this.fallback.getDay(options);
  }
}
