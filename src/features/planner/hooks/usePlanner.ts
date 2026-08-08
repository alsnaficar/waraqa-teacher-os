import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/platform/database/supabase/client";
import type { CalculatedLessonEntry } from "../services/planner-engine";
import { loadOrGeneratePlan } from "../services/semester-plan.service";

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

/**
 * Loads the canonical Semester Plan projection from `planner_entries`.
 *
 * Day-level teaching state lives in `useLessonSessions`; this hook only covers
 * the planner projection.
 */
export function usePlanner(): UsePlannerResult {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CalculatedLessonEntry[]>([]);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");

  const loadPlanner = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setEntries([]);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("grade, subject, classes")
        .eq("id", user.id)
        .maybeSingle();

      let activeGrade = profile?.grade ?? "";
      let activeSubject = profile?.subject ?? "";

      const classes = profile?.classes as { assignments?: Assignment[] } | null;

      if (classes && Array.isArray(classes.assignments) && classes.assignments.length > 0) {
        const assignment = classes.assignments[0];
        activeGrade = assignment.grade || activeGrade;
        activeSubject = assignment.subject || activeSubject;
      }

      setGrade(activeGrade);
      setSubject(activeSubject);
      const loaded = await loadOrGeneratePlan(activeSubject, activeGrade);
      setEntries(loaded.entries);
    } catch (error) {
      console.error("Failed to load planner:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanner();
  }, [loadPlanner]);

  return {
    loading,
    entries,
    grade,
    subject,
    refresh: loadPlanner,
  };
}
