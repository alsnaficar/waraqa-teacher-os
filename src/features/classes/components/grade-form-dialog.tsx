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

import type { GradeCreateInput, TeacherGrade } from "../services/grade.service";
import {
  emptyGradeForm,
  formStateToGradeInput,
  gradeToFormState,
  type GradeFormState,
} from "../services/classes-ui.logic";

export type GradeFormMode = "create" | "edit";

export function GradeFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  mode: GradeFormMode;
  initial?: TeacherGrade | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: GradeCreateInput) => Promise<void>;
  busy?: boolean;
}) {
  const [form, setForm] = useState<GradeFormState>(() => emptyGradeForm());

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm(gradeToFormState(initial));
      return;
    }
    setForm(emptyGradeForm());
  }, [open, mode, initial?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("اسم الصف مطلوب.");
      return;
    }

    try {
      await onSubmit(formStateToGradeInput(form));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الصف.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة صف دراسي" : "تعديل الصف"}</DialogTitle>
          <DialogDescription>
            الصف الدراسي (مثل الأول متوسط) يُستخدم لاحقاً لربط الفصول والطلاب.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="grade-name">اسم الصف</Label>
            <Input
              id="grade-name"
              className="min-h-11"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              placeholder="الأول متوسط"
              maxLength={120}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grade-order">ترتيب العرض</Label>
            <Input
              id="grade-order"
              type="number"
              className="min-h-11"
              value={form.orderIndex}
              onChange={(event) => setForm((f) => ({ ...f, orderIndex: event.target.value }))}
              disabled={busy}
            />
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
