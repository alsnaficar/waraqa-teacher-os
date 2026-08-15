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

import type { Student, StudentCreateInput } from "../services/student.service";
import type { TeacherCatalogItem } from "../services/teacher-catalog.service";
import {
  emptyStudentForm,
  formStateToStudentInput,
  studentToFormState,
  type StudentFormState,
} from "../services/students-ui.logic";

const NONE = "__none__";

export type StudentFormMode = "create" | "edit";

export function StudentFormDialog({
  open,
  mode,
  initial,
  classes,
  grades,
  defaults,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  mode: StudentFormMode;
  initial?: Student | null;
  classes: TeacherCatalogItem[];
  grades: TeacherCatalogItem[];
  /** Prefill for create mode (e.g. current class filter). */
  defaults?: Partial<StudentFormState>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StudentCreateInput) => Promise<void>;
  busy?: boolean;
}) {
  const [form, setForm] = useState<StudentFormState>(() => emptyStudentForm());

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm(studentToFormState(initial));
      return;
    }
    setForm(emptyStudentForm(defaults));
  }, [open, mode, initial?.id, defaults?.classId, defaults?.gradeId]);

  function applyClass(classId: string) {
    const selected = classes.find((item) => item.id === classId);
    setForm((f) => ({
      ...f,
      classId,
      gradeId: selected?.gradeId?.trim() ? selected.gradeId : f.gradeId,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.fullName.trim()) {
      toast.error("اسم الطالب مطلوب.");
      return;
    }

    try {
      await onSubmit(formStateToStudentInput(form));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الطالب.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة طالب" : "تعديل طالب"}</DialogTitle>
          <DialogDescription>
            بيانات الطالب مرتبطة بحسابك كمعلم. لا يُرسل معرّف المعلم من الواجهة.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="st-full-name">الاسم الكامل</Label>
            <Input
              id="st-full-name"
              className="min-h-11"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="st-code">رمز الطالب</Label>
            <Input
              id="st-code"
              className="min-h-11"
              value={form.studentCode}
              onChange={(e) => setForm((f) => ({ ...f, studentCode: e.target.value }))}
              placeholder="اختياري"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-class">الفصل</Label>
              <Select
                value={form.classId || NONE}
                onValueChange={(value) => {
                  if (value === NONE) {
                    setForm((f) => ({ ...f, classId: "" }));
                    return;
                  }
                  applyClass(value);
                }}
              >
                <SelectTrigger id="st-class" className="min-h-11">
                  <SelectValue placeholder="بدون فصل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون فصل</SelectItem>
                  {classes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="st-grade">الصف</Label>
              <Select
                value={form.gradeId || NONE}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, gradeId: value === NONE ? "" : value }))
                }
              >
                <SelectTrigger id="st-grade" className="min-h-11">
                  <SelectValue placeholder="بدون صف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون صف</SelectItem>
                  {grades.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={form.active ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setForm((f) => ({ ...f, active: true }))}
            >
              نشط
            </Button>
            <Button
              type="button"
              variant={!form.active ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setForm((f) => ({ ...f, active: false }))}
            >
              موقوف
            </Button>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" className="min-h-11 w-full" disabled={busy}>
              {busy ? "جاري الحفظ…" : mode === "create" ? "إضافة" : "حفظ التعديلات"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
