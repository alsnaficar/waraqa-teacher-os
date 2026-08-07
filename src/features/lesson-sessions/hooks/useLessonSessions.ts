import { useEffect, useState } from "react";
import { LessonSessionService } from "../services/lesson-session.service";
import type { LessonSession } from "../types";

export function useLessonSessions() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<LessonSession[]>([]);

  async function refresh() {
    setLoading(true);

    try {
      const data = await LessonSessionService.getTodaySessions();
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return {
    loading,
    sessions,
    refresh,
  };
}
