import type { TeacherClass } from "./class.service";
import type { TeacherGrade } from "./grade.service";

export const GRADES_EMPTY_TITLE = "لا توجد صفوف بعد";
export const GRADES_EMPTY_DESCRIPTION =
  "أضف الصفوف الدراسية التي تدرّسها (مثل الأول متوسط) لربط الفصول والطلاب لاحقاً.";
export const CLASSES_EMPTY_TITLE = "لا توجد فصول بعد";
export const CLASSES_EMPTY_DESCRIPTION =
  "أضف فصولك (مثل 1/أ) واربطها بالصف الدراسي المناسب.";
export const CATALOG_ERROR_TITLE = "تعذر تحميل الصفوف والفصول";

export type GradeFormState = {
  name: string;
  orderIndex: string;
};

export type ClassFormState = {
  name: string;
  gradeId: string;
};

export function emptyGradeForm(): GradeFormState {
  return { name: "", orderIndex: "0" };
}

export function gradeToFormState(grade: TeacherGrade): GradeFormState {
  return {
    name: grade.name,
    orderIndex: String(grade.orderIndex),
  };
}

export function formStateToGradeInput(state: GradeFormState): {
  name: string;
  orderIndex: number;
} {
  const parsed = Number.parseInt(state.orderIndex.trim(), 10);
  return {
    name: state.name.trim(),
    orderIndex: Number.isFinite(parsed) ? parsed : 0,
  };
}

export function emptyClassForm(): ClassFormState {
  return { name: "", gradeId: "" };
}

export function classToFormState(klass: TeacherClass): ClassFormState {
  return {
    name: klass.name,
    gradeId: klass.gradeId ?? "",
  };
}

export function formStateToClassInput(state: ClassFormState): {
  name: string;
  gradeId: string | null;
} {
  return {
    name: state.name.trim(),
    gradeId: state.gradeId.trim() || null,
  };
}

export function toClassListItemView(
  klass: TeacherClass,
  gradeNameById: ReadonlyMap<string, string>,
): {
  id: string;
  name: string;
  gradeLabel: string;
} {
  return {
    id: klass.id,
    name: klass.name,
    gradeLabel: klass.gradeId
      ? (gradeNameById.get(klass.gradeId) ?? "صف غير معروف")
      : "بدون صف",
  };
}

/** Guard used by tests: catalog views must never carry client teacher_id. */
export function assertNoClientTeacherId(view: object): void {
  const keys = Object.keys(view);
  if (keys.includes("teacherId") || keys.includes("teacher_id")) {
    throw new Error("Catalog view must not expose teacher_id");
  }
}
