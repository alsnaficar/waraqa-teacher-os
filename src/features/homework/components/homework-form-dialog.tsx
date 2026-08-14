import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { LessonSessionService, todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
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
import { Textarea } from "@/shared/ui/textarea";

import type { Homework, HomeworkCreateInput } from "../services/homework.service";
import {
  emptyHomeworkForm,
  formStateToCreateInput,
  formatSessionOptionLabel,
  HOMEWORK_STATUS_HINT,
  HOMEWORK_STATUS_OPTIONS,
  homeworkToFormState,
  type HomeworkFormState,
} from "../services/homework-ui.logic";

const NONE_SESSION = "__none__";

export type HomeworkFormMode = "create" | "edit";

export function HomeworkFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  mode: HomeworkFormMode;
  initial?: Homework | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: HomeworkCreateInput) => Promise<void>;
  busy?: boolean;
}) {
  const [form, setForm] = useState<HomeworkFormState>(() =>
    emptyHomeworkForm({ sessionPickerDate: todayIso() }),
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm(
        homeworkToFormState(initial, initial.dueDate || todayIso()),
      );
      return;
    }
    setForm(emptyHomeworkForm({ sessionPickerDate: todayIso() }));
  }, [open, mode, initial?.id]);

  const sessionsQuery = useQuery({
    queryKey: ["homework-session-options", form.sessionPickerDate],
    enabled: open && Boolean(form.sessionPickerDate),
    staleTime: 30_000,
    queryFn: () => LessonSessionService.getSessionViewsByDate(form.sessionPickerDate),
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("عنوان الواجب مطلوب.");
      return;
    }

    try {
      await onSubmit(formStateToCreateInput(form));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الواجب.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "إضافة واجب" : "تعديل واجب"}</DialogTitle>
          <DialogDescription>{HOMEWORK_STATUS_HINT}</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="hw-title">العنوان</Label>
            <Input
              id="hw-title"
              className="min-h-11"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hw-instructions">التعليمات</Label>
            <Textarea
              id="hw-instructions"
              className="min-h-24"
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="hw-subject">المادة</Label>
              <Input
                id="hw-subject"
                className="min-h-11"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hw-grade">الصف</Label>
              <Input
                id="hw-grade"
                className="min-h-11"
                value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hw-class">الفصل</Label>
              <Input
                id="hw-class"
                className="min-h-11"
                value={form.className}
                onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hw-due">تاريخ التسليم</Label>
              <Input
                id="hw-due"
                type="date"
                className="min-h-11"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hw-status">الحالة</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, status: value as HomeworkFormState["status"] }))
                }
              >
                <SelectTrigger id="hw-status" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOMEWORK_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              ربط اختياري بحصة موجودة (بدون إنشاء حصص جديدة)
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="hw-session-date">تاريخ الحصة</Label>
              <Input
                id="hw-session-date"
                type="date"
                className="min-h-11"
                value={form.sessionPickerDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sessionPickerDate: e.target.value,
                    lessonSessionId: "",
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hw-session">الحصة</Label>
              <Select
                value={form.lessonSessionId || NONE_SESSION}
                onValueChange={(value) => {
                  if (value === NONE_SESSION) {
                    setForm((f) => ({ ...f, lessonSessionId: "" }));
                    return;
                  }
                  const session = (sessionsQuery.data ?? []).find((item) => item.id === value);
                  setForm((f) => ({
                    ...f,
                    lessonSessionId: value,
                    subject: f.subject || session?.subject || "",
                    grade: f.grade || session?.grade || "",
                    className: f.className || session?.className || "",
                  }));
                }}
              >
                <SelectTrigger id="hw-session" className="min-h-11">
                  <SelectValue placeholder="بدون ربط بحصة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SESSION}>بدون ربط بحصة</SelectItem>
                  {(sessionsQuery.data ?? []).map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {formatSessionOptionLabel(session)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sessionsQuery.isPending ? (
                <p className="text-[11px] text-muted-foreground">جاري تحميل الحصص…</p>
              ) : null}
              {!sessionsQuery.isPending &&
              form.sessionPickerDate &&
              (sessionsQuery.data?.length ?? 0) === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  لا توجد حصص في هذا التاريخ. اختر يوماً آخر أو اترك الربط فارغاً.
                </p>
              ) : null}
            </div>
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
