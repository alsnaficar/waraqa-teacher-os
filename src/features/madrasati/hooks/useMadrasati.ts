import { useEffect, useState } from "react";
import { MadrasatiService } from "../services/madrasati.service";
import type { MadrasatiTeacherProfile, MadrasatiTimetableLesson } from "../types";

export function useMadrasati() {
  const [loading, setLoading] = useState(true);

  const [connected, setConnected] = useState(false);

  const [profile, setProfile] = useState<MadrasatiTeacherProfile | null>(null);

  const [timetable, setTimetable] = useState<MadrasatiTimetableLesson[]>([]);

  async function refresh() {
    setLoading(true);

    try {
      const connection = await MadrasatiService.isConnected();

      setConnected(connection);

      if (!connection) {
        setProfile(null);
        setTimetable([]);
        return;
      }

      await MadrasatiService.syncEverything();

      setProfile(await MadrasatiService.getTeacherProfile());
      setTimetable(await MadrasatiService.getTeacherTimetable());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return {
    loading,
    connected,
    profile,
    timetable,
    refresh,
  };
}
