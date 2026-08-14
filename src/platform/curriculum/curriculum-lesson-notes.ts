/** Extended lesson details stored in curriculum_lessons.notes JSON. */

export function serializeLessonNotes(lesson: {
  unitNumber?: string;
  unitName?: string;
  lessonNumber?: string;
  outcomes?: string;
  activities?: string;
  assessment?: string;
  periods?: string;
  notes?: string;
}): string {
  return JSON.stringify({
    unitNumber: lesson.unitNumber || "",
    unitName: lesson.unitName || "",
    lessonNumber: lesson.lessonNumber || "",
    outcomes: lesson.outcomes || "",
    activities: lesson.activities || "",
    assessment: lesson.assessment || "",
    periods: lesson.periods || "1",
    notes: lesson.notes || "",
  });
}

export function deserializeLessonNotes(notesStr: string | null) {
  if (!notesStr) {
    return {
      unitNumber: "",
      unitName: "",
      lessonNumber: "",
      outcomes: "",
      activities: "",
      resources: "",
      assessment: "",
      periods: "1",
      notes: "",
    };
  }
  try {
    const trimmed = notesStr.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      return {
        unitNumber: parsed.unitNumber || "",
        unitName: parsed.unitName || "",
        lessonNumber: parsed.lessonNumber || "",
        outcomes: parsed.outcomes || "",
        activities: parsed.activities || "",
        resources: parsed.resources || "",
        assessment: parsed.assessment || "",
        periods: parsed.periods || "1",
        notes: parsed.notes || "",
      };
    }
  } catch {
    // fallback
  }
  return {
    unitNumber: "",
    unitName: "",
    lessonNumber: "",
    outcomes: "",
    activities: "",
    resources: "",
    assessment: "",
    periods: "1",
    notes: notesStr,
  };
}
