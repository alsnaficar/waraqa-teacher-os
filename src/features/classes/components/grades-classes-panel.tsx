import { Layers, Pencil, Plus, School, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/shared/components/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useClasses } from "../hooks/useClasses";
import { useGrades } from "../hooks/useGrades";
import type { TeacherClass } from "../services/class.service";
import type { TeacherGrade } from "../services/grade.service";
import {
  CATALOG_ERROR_TITLE,
  CLASSES_EMPTY_DESCRIPTION,
  CLASSES_EMPTY_TITLE,
  GRADES_EMPTY_DESCRIPTION,
  GRADES_EMPTY_TITLE,
  toClassListItemView,
} from "../services/classes-ui.logic";
import { ClassFormDialog } from "./class-form-dialog";
import { GradeFormDialog } from "./grade-form-dialog";

export function GradesClassesPanel() {
  const {
    items: grades,
    loading: gradesLoading,
    error: gradesError,
    create: createGrade,
    update: updateGrade,
    remove: removeGrade,
  } = useGrades();

  const {
    items: classes,
    loading: classesLoading,
    error: classesError,
    create: createClass,
    update: updateClass,
    remove: removeClass,
  } = useClasses();

  const [gradeFormOpen, setGradeFormOpen] = useState(false);
  const [gradeFormMode, setGradeFormMode] = useState<"create" | "edit">("create");
  const [editingGrade, setEditingGrade] = useState<TeacherGrade | null>(null);
  const [deleteGrade, setDeleteGrade] = useState<TeacherGrade | null>(null);

  const [classFormOpen, setClassFormOpen] = useState(false);
  const [classFormMode, setClassFormMode] = useState<"create" | "edit">("create");
  const [editingClass, setEditingClass] = useState<TeacherClass | null>(null);
  const [deleteClass, setDeleteClass] = useState<TeacherClass | null>(null);

  const gradeNameById = useMemo(
    () => new Map(grades.map((grade) => [grade.id, grade.name])),
    [grades],
  );
  const classViews = classes.map((klass) => toClassListItemView(klass, gradeNameById));

  const loading = gradesLoading || classesLoading;
  const error = gradesError ?? classesError;

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card className="shadow-sm border-slate-100">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <School className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold">الصفوف الدراسية</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  عرّف الصفوف التي تدرّسها قبل إضافة الفصول والطلاب.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="min-h-11 gap-1"
              onClick={() => {
                setGradeFormMode("create");
                setEditingGrade(null);
                setGradeFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة صف
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : error ? (
            <EmptyState
              icon={School}
              title={CATALOG_ERROR_TITLE}
              description={error instanceof Error ? error.message : "حاول مرة أخرى."}
            />
          ) : grades.length === 0 ? (
            <EmptyState
              icon={School}
              title={GRADES_EMPTY_TITLE}
              description={GRADES_EMPTY_DESCRIPTION}
            />
          ) : (
            <ul className="space-y-2">
              {grades.map((grade) => (
                <li
                  key={grade.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{grade.name}</p>
                    <p className="text-xs text-muted-foreground">ترتيب: {grade.orderIndex}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-1"
                      onClick={() => {
                        setGradeFormMode("edit");
                        setEditingGrade(grade);
                        setGradeFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      تعديل
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-1 text-destructive"
                      onClick={() => setDeleteGrade(grade)}
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-slate-100">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold">الفصول</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  أضف فصولك واربط كل فصل بصف دراسي عند الحاجة.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="min-h-11 gap-1"
              onClick={() => {
                setClassFormMode("create");
                setEditingClass(null);
                setClassFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة فصل
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : error ? null : classes.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={CLASSES_EMPTY_TITLE}
              description={CLASSES_EMPTY_DESCRIPTION}
            />
          ) : (
            <ul className="space-y-2">
              {classViews.map((view, index) => {
                const klass = classes[index]!;
                return (
                  <li
                    key={view.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{view.name}</p>
                      <p className="text-xs text-muted-foreground">{view.gradeLabel}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 gap-1"
                        onClick={() => {
                          setClassFormMode("edit");
                          setEditingClass(klass);
                          setClassFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 gap-1 text-destructive"
                        onClick={() => setDeleteClass(klass)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <GradeFormDialog
        open={gradeFormOpen}
        mode={gradeFormMode}
        initial={editingGrade}
        busy={createGrade.isPending || updateGrade.isPending}
        onOpenChange={setGradeFormOpen}
        onSubmit={async (input) => {
          if (gradeFormMode === "edit" && editingGrade) {
            await updateGrade.mutateAsync({ id: editingGrade.id, patch: input });
            toast.success("تم تحديث الصف.");
            return;
          }
          await createGrade.mutateAsync(input);
          toast.success("تم إضافة الصف.");
        }}
      />

      <ClassFormDialog
        open={classFormOpen}
        mode={classFormMode}
        initial={editingClass}
        grades={grades}
        busy={createClass.isPending || updateClass.isPending}
        onOpenChange={setClassFormOpen}
        onSubmit={async (input) => {
          if (classFormMode === "edit" && editingClass) {
            await updateClass.mutateAsync({ id: editingClass.id, patch: input });
            toast.success("تم تحديث الفصل.");
            return;
          }
          await createClass.mutateAsync(input);
          toast.success("تم إضافة الفصل.");
        }}
      />

      <AlertDialog
        open={Boolean(deleteGrade)}
        onOpenChange={(open) => {
          if (!open) setDeleteGrade(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الصف؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteGrade?.name}». الفصول المرتبطة ستفقد ربط الصف (لن تُحذف).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-wrap gap-2 sm:justify-start">
            <AlertDialogCancel className="min-h-11">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                if (!deleteGrade) return;
                void removeGrade.mutateAsync(deleteGrade.id).then(
                  () => toast.success("تم حذف الصف."),
                  (err) =>
                    toast.error(err instanceof Error ? err.message : "تعذر حذف الصف."),
                );
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteClass)}
        onOpenChange={(open) => {
          if (!open) setDeleteClass(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفصل؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteClass?.name}». الطلاب المرتبطون بهذا الفصل سيُلغى ربطهم به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-wrap gap-2 sm:justify-start">
            <AlertDialogCancel className="min-h-11">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                if (!deleteClass) return;
                void removeClass.mutateAsync(deleteClass.id).then(
                  () => toast.success("تم حذف الفصل."),
                  (err) =>
                    toast.error(err instanceof Error ? err.message : "تعذر حذف الفصل."),
                );
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
