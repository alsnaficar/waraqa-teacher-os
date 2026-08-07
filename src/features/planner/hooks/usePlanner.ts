import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { TeacherTimetableService } from "@/features/teacher-timetable/services/teacher-timetable.service";
import { useEffect, useState } from "react";
import { supabase } from "@/platform/database/supabase/client";
import {
  generateSchedule,
  recalculateAndSyncPlanner,
  syncScheduleToDatabase,
  type CalculatedLessonEntry,
} from "../services/planner-engine";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";

type Assignment = {
  stage: string;
  grade: string;
  subject: string;
  klasses: string[];
};

export interface UsePlannerResult {
  loading: boolean;
  entries: CalculatedLessonEntry[];
  grade: string;
  subject: string;
  refresh(): Promise<void>;
}

export function usePlanner(): UsePlannerResult {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CalculatedLessonEntry[]>([]);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");

  async function loadPlanner() {
    setLoading(true);
     const timetable = await TeacherTimetableService.getTimetable();
      const today = new Date().toISOString().slice(0, 10);

await LessonSessionService.generateSessionsForDate(today);

const sessions = await LessonSessionService.getSessionsByDate(today);

if (sessions.length > 0) {
  setEntries(
    sessions as never[],
  );

  setLoading(false);
  return;
}
if (timetable.length === 0) {
  setEntries([]);
  setLoading(false);
  return;
}
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      let activeGrade = "الأول متوسط";
      let activeSubject = "العلوم";

      if (profile) {
        const classes = profile.classes as {
          assignments?: Assignment[];
        } | null;

        if (classes && Array.isArray(classes.assignments) && classes.assignments.length > 0) {
          const asm = classes.assignments[0];

          activeGrade = asm.grade || activeGrade;
          activeSubject = asm.subject || activeSubject;
        } else if (profile.grade && profile.subject) {
          activeGrade = profile.grade;
          activeSubject = profile.subject;
        }
      }

      setGrade(activeGrade);
      setSubject(activeSubject);

      const calculated = await generateSchedule(activeSubject, activeGrade);

      if (calculated.length > 0) {
        setEntries(calculated);

        await syncScheduleToDatabase(calculated, activeSubject);
      } else {
        const generated = await recalculateAndSyncPlanner(activeSubject, activeGrade);

        setEntries(generated);
      }
    } catch (error) {
      console.error("Failed to load planner:", error);
    } finally {
      setLoading(false);
    }
  }

 useEffect(() => {
    void loadPlanner();
  }, []);

  return {
    loading,
    entries,
    grade,
    subject,
    refresh: loadPlanner,
  };
}
