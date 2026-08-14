import { useEffect, useState } from "react";
import { TeacherTimetableService } from "../services/teacher-timetable.service";
import type { TeacherTimetableEntry } from "../types";

export function useTeacherTimetable() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TeacherTimetableEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);

  async function refresh() {
    setError(null);

    try {
      const timetable = await TeacherTimetableService.getTimetable();
      setEntries(timetable);
    } catch (err) {
      console.error("Failed to load teacher timetable:", err);
      setEntries([]);
      setError(err instanceof Error ? err : new Error("تعذر تحميل الجدول الأسبوعي"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return {
    loading,
    entries,
    error,
    refresh,
  };
}
