import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

import type { TeacherCatalogItem } from "../services/teacher-catalog.service";
import type { Student } from "../services/student.service";
import {
  buildHomeworkBulkAssignPreview,
  formatHomeworkBulkAssignConfirm,
  formatHomeworkBulkAssignResult,
} from "../services/homework-bulk-assign.logic";

const ALL = "all";

export function HomeworkBulkAssignDialog({
  open,
  homeworkTitle,
  grades,
  classes,
  students,
  busy,
  onOpenChange,
  onAssign,
}: {
  open: boolean;
  homeworkTitle: string;
  grades: TeacherCatalogItem[];
  classes: TeacherCatalogItem[];
  students: Student[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (classId: string) => Promise<{
    createdCount: number;
    skippedExistingCount: number;
    eligibleCount: number;
  }>;
}) {
  const [gradeId, setGradeId] = useState<string>(ALL);
  const [classId, setClassId] = useState<string>("");

  const classesForGrade = useMemo(() => {
    if (gradeId === ALL) return classes;
    return classes.filter((item) => item.gradeId === gradeId);
  }, [classes, gradeId]);

  const selectedClass = classes.find((item) => item.id === classId) ?? null;
  const selectedGradeLabel =
    (selectedClass?.gradeId
      ? grades.find((grade) => grade.id === selectedClass.gradeId)?.name
      : gradeId !== ALL
        ? grades.find((grade) => grade.id === gradeId)?.name
        : null) ?? "بدون صف";

  const preview = useMemo(() => {
    if (!classId) {
      return {
        classId: "",
        classLabel: "",
        gradeLabel: "",
        eligibleCount: 0,
        studentNames: [] as string[],
      };
    }
    return buildHomeworkBulkAssignPreview({
      classId,
      classLabel: selectedClass?.name ?? "—",
      gradeLabel: selectedGradeLabel,
      students,
    });
  }, [classId, selectedClass, selectedGradeLabel, students]);

  async function handleConfirm() {
    if (!classId) {
      toast.error("اختر فصلاً أولاً.");
      return;
    }
    if (preview.eligibleCount <= 0) {
      toast.error("لا يوجد طلاب نشطون في هذا الفصل.");
      return;
    }

    try {
      const result = await onAssign(classId);
      toast.success(
        formatHomeworkBulkAssignResult({
          createdCount: result.createdCount,
          skippedExistingCount: result.skippedExistingCount,
        }),
      );
      setClassId("");
      setGradeId(ALL);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إسناد الواجب للفصل.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setClassId("");
          setGradeId(ALL);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إسناد للفصل</DialogTitle>
          <DialogDescription>
            إسناد واجب «{homeworkTitle}» إلى كل الطلاب النشطين في الفصل المحدد. لن يُنشأ تسليم
            مكرر لمن أُسند إليهم مسبقاً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-hw-grade">الصف</Label>
              <Select
                value={gradeId}
                onValueChange={(value) => {
                  setGradeId(value);
                  if (classId) {
                    const current = classes.find((item) => item.id === classId);
                    if (value !== ALL && current && current.gradeId !== value) {
                      setClassId("");
                    }
                  }
                }}
                disabled={busy}
              >
                <SelectTrigger id="bulk-hw-grade" className="min-h-11">
                  <SelectValue placeholder="كل الصفوف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الصفوف</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-hw-class">الفصل</Label>
              <Select
                value={classId || undefined}
                onValueChange={setClassId}
                disabled={busy}
              >
                <SelectTrigger id="bulk-hw-class" className="min-h-11">
                  <SelectValue placeholder="اختر الفصل" />
                </SelectTrigger>
                <SelectContent>
                  {classesForGrade.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {classId ? (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="font-medium">عدد الطلاب النشطين: {preview.eligibleCount}</p>
              <p className="text-xs text-muted-foreground">
                {formatHomeworkBulkAssignConfirm(preview.eligibleCount)}
              </p>
              {preview.studentNames.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {preview.studentNames.map((name) => (
                    <li key={name}>• {name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">اختر الصف ثم الفصل لمعاينة الطلاب.</p>
          )}
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-start">
          <Button
            type="button"
            className="min-h-11"
            disabled={busy || !classId || preview.eligibleCount <= 0}
            onClick={() => void handleConfirm()}
          >
            {busy ? "جاري الإسناد…" : "تأكيد الإسناد"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
