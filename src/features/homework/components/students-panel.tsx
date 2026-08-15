import { ClipboardPaste, Pencil, Plus, Trash2, UserRound } from "lucide-react";
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
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/utils";

import { useStudents } from "../hooks/useStudents";
import type { Student } from "../services/student.service";
import {
  filterStudents,
  STUDENTS_EMPTY_DESCRIPTION,
  STUDENTS_EMPTY_TITLE,
  STUDENTS_ERROR_TITLE,
  STUDENTS_SELECT_CLASS_HINT,
  toStudentListItemView,
} from "../services/students-ui.logic";
import { StudentBulkImportDialog } from "./student-bulk-import-dialog";
import { StudentFormDialog } from "./student-form-dialog";

const ALL = "all";

export function StudentsPanel() {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>(ALL);
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const serviceFilter = useMemo(
    () => ({
      ...(classFilter !== ALL ? { classId: classFilter } : {}),
      ...(gradeFilter !== ALL && classFilter === ALL ? { gradeId: gradeFilter } : {}),
      ...(activeFilter === "active"
        ? { active: true }
        : activeFilter === "inactive"
          ? { active: false }
          : {}),
    }),
    [classFilter, gradeFilter, activeFilter],
  );

  const { items, loading, error, refresh, classes, grades, create, update, remove, bulkCreate } =
    useStudents(serviceFilter);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const classNameById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );
  const gradeNameById = useMemo(
    () => new Map(grades.map((item) => [item.id, item.name])),
    [grades],
  );

  const classesForGrade = useMemo(() => {
    if (gradeFilter === ALL) return classes;
    return classes.filter((item) => item.gradeId === gradeFilter);
  }, [classes, gradeFilter]);

  const selectedClass = classes.find((item) => item.id === classFilter) ?? null;
  const selectedGradeId =
    selectedClass?.gradeId ?? (gradeFilter !== ALL ? gradeFilter : null);

  const filtered = useMemo(
    () =>
      filterStudents(items, {
        search,
        classId: classFilter,
        gradeId: gradeFilter,
        active: activeFilter,
      }),
    [items, search, classFilter, gradeFilter, activeFilter],
  );
  const views = filtered.map((student) =>
    toStudentListItemView(student, { classNameById, gradeNameById }),
  );

  const existingInSelectedClass = useMemo(
    () => (classFilter === ALL ? [] : items.filter((student) => student.classId === classFilter)),
    [items, classFilter],
  );

  const createDefaults = useMemo(
    () => ({
      classId: classFilter !== ALL ? classFilter : "",
      gradeId: selectedGradeId ?? "",
    }),
    [classFilter, selectedGradeId],
  );

  function openCreate() {
    setFormMode("create");
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(student: Student) {
    setFormMode("edit");
    setEditing(student);
    setFormOpen(true);
  }

  async function toggleActive(student: Student) {
    try {
      await update.mutateAsync({ id: student.id, patch: { active: !student.active } });
      toast.success(student.active ? "تم إيقاف الطالب." : "تم تفعيل الطالب.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث حالة الطالب.");
    }
  }

  function handleGradeChange(value: string) {
    setGradeFilter(value);
    if (value === ALL) return;
    if (classFilter !== ALL) {
      const current = classes.find((item) => item.id === classFilter);
      if (current && current.gradeId !== value) {
        setClassFilter(ALL);
      }
    }
  }

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">الطلاب</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                قائمة طلابك حسب الصف والفصل. استخدم اللصق لإضافة عدة أسماء دفعة واحدة.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{STUDENTS_SELECT_CLASS_HINT}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-1"
              disabled={classFilter === ALL}
              onClick={() => setBulkOpen(true)}
            >
              <ClipboardPaste className="h-4 w-4" />
              لصق قائمة
            </Button>
            <Button type="button" className="min-h-11 gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              إضافة طالب
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-h-11 min-w-0 flex-1 basis-full sm:basis-64"
          placeholder="بحث بالاسم أو الرمز…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="بحث عن طالب"
        />
        <Select value={gradeFilter} onValueChange={handleGradeChange}>
          <SelectTrigger className="min-h-11 w-full sm:w-48" aria-label="تصفية حسب الصف">
            <SelectValue placeholder="كل الصفوف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الصفوف</SelectItem>
            {grades.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classFilter}
          onValueChange={setClassFilter}
        >
          <SelectTrigger className="min-h-11 w-full sm:w-48" aria-label="تصفية حسب الفصل">
            <SelectValue placeholder="كل الفصول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفصول</SelectItem>
            {classesForGrade.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={activeFilter === "all" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setActiveFilter("all")}
        >
          الكل
        </Button>
        <Button
          type="button"
          variant={activeFilter === "active" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setActiveFilter("active")}
        >
          نشط
        </Button>
        <Button
          type="button"
          variant={activeFilter === "inactive" ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setActiveFilter("inactive")}
        >
          موقوف
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={UserRound}
          title={STUDENTS_ERROR_TITLE}
          description={error instanceof Error ? error.message : "حدث خطأ غير متوقع."}
          action={
            <Button className="min-h-11" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : views.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={STUDENTS_EMPTY_TITLE}
          description={STUDENTS_EMPTY_DESCRIPTION}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="min-h-11 gap-1" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                إضافة طالب
              </Button>
              <Button
                variant="outline"
                className="min-h-11 gap-1"
                disabled={classFilter === ALL}
                onClick={() => setBulkOpen(true)}
              >
                <ClipboardPaste className="h-4 w-4" />
                لصق قائمة
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-start font-medium">الاسم</th>
                  <th className="px-3 py-3 text-start font-medium">الرمز</th>
                  <th className="px-3 py-3 text-start font-medium">الفصل</th>
                  <th className="px-3 py-3 text-start font-medium">الصف</th>
                  <th className="px-3 py-3 text-start font-medium">الحالة</th>
                  <th className="px-3 py-3 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student, index) => {
                  const view = views[index]!;
                  return (
                    <tr key={student.id} className="border-t">
                      <td className="px-3 py-3 font-medium">{view.fullName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{view.studentCodeLabel}</td>
                      <td className="px-3 py-3">{view.classLabel}</td>
                      <td className="px-3 py-3">{view.gradeLabel}</td>
                      <td className="px-3 py-3">
                        <Badge variant={view.active ? "secondary" : "outline"}>
                          {view.activeLabel}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => openEdit(student)}
                          >
                            تعديل
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => void toggleActive(student)}
                          >
                            {student.active ? "إيقاف" : "تفعيل"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 text-destructive"
                            onClick={() => setDeleteTarget(student)}
                          >
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((student, index) => {
              const view = views[index]!;
              return (
                <Card key={student.id} className="min-w-0 overflow-hidden">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <h3 className="truncate text-base font-bold">{view.fullName}</h3>
                        <p className="text-xs text-muted-foreground">
                          {view.studentCodeLabel} · {view.classLabel} · {view.gradeLabel}
                        </p>
                      </div>
                      <Badge variant={view.active ? "secondary" : "outline"}>
                        {view.activeLabel}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 gap-1"
                        onClick={() => openEdit(student)}
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1"
                        onClick={() => void toggleActive(student)}
                      >
                        {student.active ? "إيقاف" : "تفعيل"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn("min-h-11 flex-1 gap-1 text-destructive")}
                        onClick={() => setDeleteTarget(student)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <StudentFormDialog
        open={formOpen}
        mode={formMode}
        initial={editing}
        defaults={createDefaults}
        classes={classes}
        grades={grades}
        busy={create.isPending || update.isPending}
        onOpenChange={setFormOpen}
        onSubmit={async (input) => {
          if (formMode === "create") {
            await create.mutateAsync(input);
            toast.success("تمت إضافة الطالب.");
            return;
          }
          if (!editing) throw new Error("معرّف الطالب مفقود.");
          await update.mutateAsync({ id: editing.id, patch: input });
          toast.success("تم تحديث الطالب.");
        }}
      />

      <StudentBulkImportDialog
        open={bulkOpen}
        classId={classFilter !== ALL ? classFilter : ""}
        classLabel={selectedClass?.name ?? "—"}
        gradeId={selectedGradeId}
        existingInClass={existingInSelectedClass}
        busy={bulkCreate.isPending}
        onOpenChange={setBulkOpen}
        onImport={(input) => bulkCreate.mutateAsync(input)}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الطالب؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.fullName}» إن سمحت سياسة قاعدة البيانات بذلك. التسليمات
              المرتبطة قد تمنع الحذف. يُفضّل الإيقاف بدلاً من الحذف عند الحاجة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                void remove.mutateAsync(deleteTarget.id).then(
                  () => {
                    toast.success("تم حذف الطالب.");
                    setDeleteTarget(null);
                  },
                  (err) => {
                    toast.error(err instanceof Error ? err.message : "تعذر حذف الطالب.");
                  },
                );
              }}
            >
              {remove.isPending ? "جاري الحذف…" : "تأكيد الحذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 w-full" disabled={remove.isPending}>
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
