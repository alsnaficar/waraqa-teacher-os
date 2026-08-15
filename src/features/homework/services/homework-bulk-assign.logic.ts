import type { Student } from "./student.service";

export type HomeworkBulkAssignPreview = {
  classId: string;
  classLabel: string;
  gradeLabel: string;
  eligibleCount: number;
  studentNames: string[];
};

export function buildHomeworkBulkAssignPreview(input: {
  classId: string;
  classLabel: string;
  gradeLabel: string;
  students: Student[];
}): HomeworkBulkAssignPreview {
  const eligible = input.students
    .filter(
      (student) =>
        student.active &&
        student.classId === input.classId,
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

  return {
    classId: input.classId,
    classLabel: input.classLabel,
    gradeLabel: input.gradeLabel,
    eligibleCount: eligible.length,
    studentNames: eligible.map((student) => student.fullName),
  };
}

export function formatHomeworkBulkAssignConfirm(count: number): string {
  if (count <= 0) return "لا يوجد طلاب نشطون في هذا الفصل لإسناد الواجب.";
  return `سيتم إسناد الواجب إلى ${count} طالبًا.`;
}

export function formatHomeworkBulkAssignResult(input: {
  createdCount: number;
  skippedExistingCount: number;
}): string {
  return `تم الإسناد إلى ${input.createdCount} طالبًا · تم تجاوز ${input.skippedExistingCount} لأنهم مسند إليهم مسبقًا`;
}
