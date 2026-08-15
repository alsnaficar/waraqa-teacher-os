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

import type { ClassCreateInput } from "../services/class.service";
import type { TeacherClass } from "../services/class.service";
import type { TeacherGrade } from "../services/grade.service";
import {
  classToFormState,
  emptyClassForm,
  formStateToClassInput,
  type ClassFormState,
} from "../services/classes-ui.logic";

const NONE = "__none__";

export type ClassFormMode = "create" | "edit";

export function ClassFormDialog({
  open,
  mode,
  initial,
  grades,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  mode: ClassFormMode;
  initial?: TeacherClass | null;
  grades: TeacherGrade[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ClassCreateInput) => Promise<void>;
  busy?: boolean;
}) {
  const [form, setForm] = useState<ClassFormState>(() => emptyClassForm());

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm(classToFormState(initial));
      return;
    }
    setForm(emptyClassForm());
  }, [open, mode, initial?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("اسم الفصل مطلوب.");
      return;
    }

    try {
      await onSubmit(formStateToClassInput(form));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الفصل.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة فصل" : "تعديل الفصل"}</DialogTitle>
          <DialogDescription>
            الفصل (مثل 1/أ) يمكن ربطه بصف دراسي. الربط اختياري.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="class-name">اسم الفصل</Label>
            <Input
              id="class-name"
              className="min-h-11"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              placeholder="1/أ"
              maxLength={120}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="class-grade">الصف الدراسي</Label>
            <Select
              value={form.gradeId || NONE}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, gradeId: value === NONE ? "" : value }))
              }
              disabled={busy}
            >
              <SelectTrigger id="class-grade" className="min-h-11">
                <SelectValue placeholder="بدون صف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>بدون صف</SelectItem>
                {grades.map((grade) => (
                  <SelectItem key={grade.id} value={grade.id}>
                    {grade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-start">
            <Button type="submit" className="min-h-11" disabled={busy}>
              {busy ? "جارٍ الحفظ…" : mode === "create" ? "إضافة" : "حفظ"}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
