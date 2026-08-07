import { useEffect, useState } from "react";
import { TeacherTimetableService } from "../services/teacher-timetable.service";
import type { TeacherTimetableEntry } from "../types";

export function useTeacherTimetable() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TeacherTimetableEntry[]>([]);

  async function refresh() {
    setLoading(true);

    try {
      const timetable = await TeacherTimetableService.getTimetable();
      setEntries(timetable);
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
    refresh,
  };
}
