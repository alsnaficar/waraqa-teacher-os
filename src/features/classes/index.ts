export { GradeService } from "./services/grade.service";
export type { TeacherGrade, GradeCreateInput, GradeUpdateInput } from "./services/grade.service";

export { ClassService } from "./services/class.service";
export type {
  TeacherClass,
  ClassCreateInput,
  ClassUpdateInput,
  ClassListFilter,
} from "./services/class.service";

export { useGrades } from "./hooks/useGrades";
export { useClasses } from "./hooks/useClasses";
export { GradesClassesPanel } from "./components/grades-classes-panel";
