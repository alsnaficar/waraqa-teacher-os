import { useEffect, useMemo } from "react";

import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useAcademicTerms } from "@/platform/config/academic-config";

export type EducationStage = "primary" | "intermediate" | "secondary";
export type Semester = string;

export type CurriculumSelection = {
  stage: EducationStage | "";
  grade: string;
  subject: string;
  semester: Semester | "";
};

export const EMPTY_CURRICULUM: CurriculumSelection = {
  stage: "",
  grade: "",
  subject: "",
  semester: "",
};

export type CurriculumSelectorErrors = Partial<Record<keyof CurriculumSelection, string>>;

export const STAGE_LABEL: Record<EducationStage, string> = {
  primary: "المرحلة الابتدائية",
  intermediate: "المرحلة المتوسطة",
  secondary: "المرحلة الثانوية",
};

export const GRADES_BY_STAGE: Record<EducationStage, string[]> = {
  primary: [
    "الصف الأول الابتدائي",
    "الصف الثاني الابتدائي",
    "الصف الثالث الابتدائي",
    "الصف الرابع الابتدائي",
    "الصف الخامس الابتدائي",
    "الصف السادس الابتدائي",
  ],
  intermediate: ["الصف الأول المتوسط", "الصف الثاني المتوسط", "الصف الثالث المتوسط"],
  secondary: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"],
};

export const SUBJECTS_BY_STAGE: Record<EducationStage, string[]> = {
  primary: [
    "اللغة العربية",
    "الرياضيات",
    "العلوم",
    "الدراسات الإسلامية",
    "الدراسات الاجتماعية",
    "اللغة الإنجليزية",
  ],
  intermediate: [
    "اللغة العربية",
    "الرياضيات",
    "العلوم",
    "الدراسات الإسلامية",
    "الدراسات الاجتماعية",
    "اللغة الإنجليزية",
    "الحاسب وتقنية المعلومات",
  ],
  secondary: [
    "اللغة العربية",
    "الرياضيات",
    "الفيزياء",
    "الكيمياء",
    "الأحياء",
    "الدراسات الإسلامية",
    "التاريخ",
    "الجغرافيا",
    "اللغة الإنجليزية",
    "الحاسب وتقنية المعلومات",
  ],
};

export function CurriculumSelector({
  value,
  onChange,
  errors,
}: {
  value: CurriculumSelection;
  onChange: (next: CurriculumSelection) => void;
  errors?: CurriculumSelectorErrors;
}) {
  const academicTerms = useAcademicTerms();
  const grades = useMemo(() => (value.stage ? GRADES_BY_STAGE[value.stage] : []), [value.stage]);
  const subjects = useMemo(
    () => (value.stage ? SUBJECTS_BY_STAGE[value.stage] : []),
    [value.stage],
  );

  // Reset grade/subject when they no longer belong to the selected stage.
  useEffect(() => {
    if (!value.stage) return;
    const next = { ...value };
    let changed = false;
    if (next.grade && !grades.includes(next.grade)) {
      next.grade = "";
      changed = true;
    }
    if (next.subject && !subjects.includes(next.subject)) {
      next.subject = "";
      changed = true;
    }
    if (changed) onChange(next);
  }, [value, grades, subjects, onChange]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="curriculum-stage">المرحلة الدراسية</Label>
        <Select
          value={value.stage || undefined}
          onValueChange={(v) => onChange({ ...value, stage: v as EducationStage })}
        >
          <SelectTrigger id="curriculum-stage" aria-invalid={!!errors?.stage}>
            <SelectValue placeholder="اختر المرحلة" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STAGE_LABEL) as EducationStage[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.stage ? <p className="text-xs text-destructive">{errors.stage}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="curriculum-grade">الصف</Label>
        <Select
          value={value.grade || undefined}
          onValueChange={(v) => onChange({ ...value, grade: v })}
          disabled={!value.stage}
        >
          <SelectTrigger id="curriculum-grade" aria-invalid={!!errors?.grade}>
            <SelectValue placeholder={value.stage ? "اختر الصف" : "اختر المرحلة أولاً"} />
          </SelectTrigger>
          <SelectContent>
            {grades.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.grade ? <p className="text-xs text-destructive">{errors.grade}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="curriculum-subject">المادة</Label>
        <Select
          value={value.subject || undefined}
          onValueChange={(v) => onChange({ ...value, subject: v })}
          disabled={!value.stage}
        >
          <SelectTrigger id="curriculum-subject" aria-invalid={!!errors?.subject}>
            <SelectValue placeholder={value.stage ? "اختر المادة" : "اختر المرحلة أولاً"} />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.subject ? <p className="text-xs text-destructive">{errors.subject}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="curriculum-semester">الفصل الدراسي</Label>
        <Select
          value={value.semester || undefined}
          onValueChange={(v) => onChange({ ...value, semester: v as Semester })}
        >
          <SelectTrigger id="curriculum-semester" aria-invalid={!!errors?.semester}>
            <SelectValue placeholder="اختر الفصل" />
          </SelectTrigger>
          <SelectContent>
            {academicTerms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.semester ? <p className="text-xs text-destructive">{errors.semester}</p> : null}
      </div>
    </div>
  );
}

export function validateCurriculum(value: CurriculumSelection): CurriculumSelectorErrors | null {
  const errors: CurriculumSelectorErrors = {};
  if (!value.stage) errors.stage = "المرحلة مطلوبة";
  if (!value.grade) errors.grade = "الصف مطلوب";
  if (!value.subject) errors.subject = "المادة مطلوبة";
  if (!value.semester) errors.semester = "الفصل مطلوب";
  return Object.keys(errors).length ? errors : null;
}
