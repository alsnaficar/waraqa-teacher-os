import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TeacherTimetableService } from "../services/teacher-timetable.service";

export const teacherTimetableQueryKey = ["teacher-timetable"] as const;

export function useTeacherTimetable() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: teacherTimetableQueryKey,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await TeacherTimetableService.getTimetable();
      } catch (err) {
        console.error("Failed to load teacher timetable:", err);
        throw err instanceof Error ? err : new Error("تعذر تحميل الجدول الأسبوعي");
      }
    },
  });

  return {
    loading: query.isPending,
    entries: query.data ?? [],
    error: query.error instanceof Error ? query.error : query.error ? new Error("تعذر تحميل الجدول الأسبوعي") : null,
    refresh: () => queryClient.invalidateQueries({ queryKey: teacherTimetableQueryKey }),
  };
}
