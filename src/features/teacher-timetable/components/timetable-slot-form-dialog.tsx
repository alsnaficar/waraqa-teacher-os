import { useEffect, useState, type FormEvent } from "react";
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
import { TIMETABLE_DAYS } from "./teacher-timetable.constants";

const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

export type TimetableSlotFormMode = "add" | "edit";

export type TimetableSlotFormState = {
  dayOfWeek: number;
  period: number;
  subject: string;
  grade: string;
  className: string;
  classroom: string;
  startsAt: string;
  endsAt: string;
};

function emptyState(overrides: Partial<TimetableSlotFormState> = {}): TimetableSlotFormState {
  return {
    dayOfWeek: 0,
    period: 1,
    subject: "",
    grade: "",
    className: "",
    classroom: "",
    startsAt: "",
    endsAt: "",
    ...overrides,
  };
}

function fromEntry(entry: TeacherTimetableEntry): TimetableSlotFormState {
  return {
    dayOfWeek: entry.dayOfWeek,
    period: entry.period,
    subject: entry.subject,
    grade: entry.grade,
    className: entry.className,
    classroom: entry.classroom ?? "",
    startsAt: entry.startsAt ?? "",
    endsAt: entry.endsAt ?? "",
  };
}

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
  initial?: Partial<TimetableSlotFormState>;
  editingId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<TimetableSlotFormState>(() => emptyState(initial));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyState(initial));
  }, [open, editingId, initial?.dayOfWeek, initial?.period, initial?.subject]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.subject.trim() || !form.grade.trim() || !form.className.trim()) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "إضافة حصة" : "تعديل حصة"}</DialogTitle>
          <DialogDescription>
            الحقول تعتمد على الجدول الأسبوعي الحالي. الحصص المحضّرة سابقاً لا تُحذف تلقائياً.
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
              <Input
                id="tt-grade"
                className="min-h-11"
                value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-class">الفصل</Label>
              <Input
                id="tt-class"
                className="min-h-11"
                value={form.className}
                onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                required
              />
            </div>
          </div>

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

export function entryToFormState(entry: TeacherTimetableEntry): TimetableSlotFormState {
  return fromEntry(entry);
}
