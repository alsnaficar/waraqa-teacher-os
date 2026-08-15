import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useClasses } from "@/features/classes/hooks/useClasses";
import { useGrades } from "@/features/classes/hooks/useGrades";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

import type { TeacherTimetableEntry } from "../types";
import {
  TeacherTimetableService,
  TimetableSlotConflictError,
  type TeacherTimetableSlotInput,
} from "../services/teacher-timetable.service";
import {
  applyClassSelection,
  applyGradeSelection,
  classesForSelectedGrade,
  emptyTimetableSlotForm,
  formHasRequiredGradeClass,
  timetableEntryToFormState,
  type TimetableSlotFormState,
} from "../services/timetable-slot-form.logic";
import { TIMETABLE_DAYS } from "./teacher-timetable.constants";

const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

export type TimetableSlotFormMode = "add" | "edit";

export type { TimetableSlotFormState };

function toSlotInput(state: TimetableSlotFormState): TeacherTimetableSlotInput {
  return {
    dayOfWeek: state.dayOfWeek,
    period: state.period,
    subject: state.subject.trim(),
    grade: state.grade.trim(),
    className: state.className.trim(),
    classroom: state.classroom.trim() || undefined,
    startsAt: state.startsAt.trim() || undefined,
    endsAt: state.endsAt.trim() || undefined,
    active: true,
  };
}

export function TimetableSlotFormDialog({
  open,
  mode,
  initial,
  editingId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: TimetableSlotFormMode;
  initial?: Partial<TimetableSlotFormState> | TeacherTimetableEntry;
  editingId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const { items: grades } = useGrades();
  const { items: classes } = useClasses();
  const [form, setForm] = useState<TimetableSlotFormState>(() => emptyTimetableSlotForm());
  const [saving, setSaving] = useState(false);

  const catalogGrades = useMemo(
    () => grades.map((grade) => ({ id: grade.id, name: grade.name })),
    [grades],
  );
  const catalogClasses = useMemo(
    () =>
      classes.map((klass) => ({
        id: klass.id,
        name: klass.name,
        gradeId: klass.gradeId,
      })),
    [classes],
  );

  const classesForGrade = useMemo(
    () => classesForSelectedGrade(catalogClasses, form.gradeId),
    [catalogClasses, form.gradeId],
  );

  useEffect(() => {
    if (!open) return;

    const partial = (initial ?? {}) as Partial<TimetableSlotFormState>;
    const base = emptyTimetableSlotForm(partial);
    const resolved = timetableEntryToFormState(
      {
        id: editingId ?? "draft",
        teacherId: "",
        dayOfWeek: base.dayOfWeek,
        period: base.period,
        subject: base.subject,
        grade: base.grade,
        className: base.className,
        classroom: base.classroom || undefined,
        startsAt: base.startsAt || undefined,
        endsAt: base.endsAt || undefined,
        active: true,
      },
      catalogGrades,
      catalogClasses,
    );

    setForm({
      ...resolved,
      dayOfWeek: base.dayOfWeek,
      period: base.period,
      subject: base.subject || resolved.subject,
      classroom: base.classroom || resolved.classroom,
      startsAt: base.startsAt || resolved.startsAt,
      endsAt: base.endsAt || resolved.endsAt,
      // Prefer explicit IDs from initial when present
      gradeId: partial.gradeId || resolved.gradeId,
      classId: partial.classId || resolved.classId,
      grade: partial.grade || resolved.grade,
      className: partial.className || resolved.className,
    });
  }, [
    open,
    editingId,
    catalogGrades,
    catalogClasses,
    initial,
  ]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.subject.trim() || !formHasRequiredGradeClass(form)) {
      toast.error("المادة والصف والفصل مطلوبة.");
      return;
    }

    setSaving(true);
    try {
      const payload = toSlotInput(form);
      if (mode === "add") {
        await TeacherTimetableService.addSlot(payload);
        toast.success("تمت إضافة الحصة إلى الجدول.");
      } else {
        if (!editingId) throw new Error("معرّف الحصة مفقود.");
        await TeacherTimetableService.updateSlot(editingId, payload);
        toast.success("تم تحديث الحصة.");
      }
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof TimetableSlotConflictError) {
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : "تعذر حفظ الحصة.");
      }
    } finally {
      setSaving(false);
    }
  }

  const hasCatalog = catalogGrades.length > 0 || catalogClasses.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "إضافة حصة" : "تعديل حصة"}</DialogTitle>
          <DialogDescription>
            اختر الصف والفصل من قائمتك. الحصص المحضّرة سابقاً لا تُحذف تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tt-day">اليوم</Label>
              <Select
                value={String(form.dayOfWeek)}
                onValueChange={(value) => setForm((f) => ({ ...f, dayOfWeek: Number(value) }))}
              >
                <SelectTrigger id="tt-day" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMETABLE_DAYS.map((day) => (
                    <SelectItem key={day.value} value={String(day.value)}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tt-period">رقم الحصة</Label>
              <Select
                value={String(form.period)}
                onValueChange={(value) => setForm((f) => ({ ...f, period: Number(value) }))}
              >
                <SelectTrigger id="tt-period" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((period) => (
                    <SelectItem key={period} value={String(period)}>
                      الحصة {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tt-subject">المادة</Label>
            <Input
              id="tt-subject"
              className="min-h-11"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tt-grade">الصف</Label>
              {hasCatalog ? (
                <Select
                  value={form.gradeId || undefined}
                  onValueChange={(value) =>
                    setForm((f) => applyGradeSelection(f, value, catalogGrades, catalogClasses))
                  }
                >
                  <SelectTrigger id="tt-grade" className="min-h-11">
                    <SelectValue placeholder="اختر الصف" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogGrades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="tt-grade"
                  className="min-h-11"
                  value={form.grade}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, grade: e.target.value, gradeId: "" }))
                  }
                  required
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-class">الفصل</Label>
              {hasCatalog ? (
                <Select
                  value={form.classId || undefined}
                  onValueChange={(value) =>
                    setForm((f) => applyClassSelection(f, value, catalogGrades, catalogClasses))
                  }
                  disabled={!form.gradeId && catalogGrades.length > 0}
                >
                  <SelectTrigger id="tt-class" className="min-h-11">
                    <SelectValue placeholder="اختر الفصل" />
                  </SelectTrigger>
                  <SelectContent>
                    {classesForGrade.map((klass) => (
                      <SelectItem key={klass.id} value={klass.id}>
                        {klass.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="tt-class"
                  className="min-h-11"
                  value={form.className}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, className: e.target.value, classId: "" }))
                  }
                  required
                />
              )}
            </div>
          </div>

          {hasCatalog && catalogGrades.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              أضف الصفوف والفصول من الإعدادات لربط الحصص بالقائمة.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="tt-classroom">القاعة (اختياري)</Label>
            <Input
              id="tt-classroom"
              className="min-h-11"
              value={form.classroom}
              onChange={(e) => setForm((f) => ({ ...f, classroom: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tt-start">وقت البداية</Label>
              <Input
                id="tt-start"
                type="time"
                className="min-h-11"
                value={form.startsAt.slice(0, 5)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    startsAt: e.target.value ? `${e.target.value}:00` : "",
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-end">وقت النهاية</Label>
              <Input
                id="tt-end"
                type="time"
                className="min-h-11"
                value={form.endsAt.slice(0, 5)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    endsAt: e.target.value ? `${e.target.value}:00` : "",
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" className="min-h-11 w-full" disabled={saving}>
              {saving ? "جاري الحفظ…" : mode === "add" ? "إضافة" : "حفظ التعديلات"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function entryToFormState(
  entry: TeacherTimetableEntry,
  grades: ReadonlyArray<{ id: string; name: string }> = [],
  classes: ReadonlyArray<{ id: string; name: string; gradeId: string | null }> = [],
): TimetableSlotFormState {
  return timetableEntryToFormState(entry, grades, classes);
}
