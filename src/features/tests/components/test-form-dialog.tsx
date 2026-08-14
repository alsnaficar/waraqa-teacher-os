import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { LessonSessionService, todayIso } from "@/features/lesson-sessions/services/lesson-session.service";
import { TeacherCatalogService } from "@/features/homework/services/teacher-catalog.service";
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

import type { TeacherTest, TestCreateInput } from "../services/test.service";
import {
  emptyTestForm,
  formStateToCreateInput,
  formatSessionOptionLabel,
  TEST_STATUS_HINT,
  testToFormState,
  type TestFormState,
} from "../services/tests-ui.logic";

const NONE_SESSION = "__none__";
const NONE_CATALOG = "__none__";

export type TestFormMode = "create" | "edit" | "view";

export function TestFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  mode: TestFormMode;
  initial?: TeacherTest | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: TestCreateInput) => Promise<void>;
  busy?: boolean;
}) {
  const readOnly = mode === "view";
  const [form, setForm] = useState<TestFormState>(() =>
    emptyTestForm({ sessionPickerDate: todayIso() }),
  );

  useEffect(() => {
    if (!open) return;
    if ((mode === "edit" || mode === "view") && initial) {
      setForm(testToFormState(initial, initial.dueDate || todayIso()));
      return;
    }
    setForm(emptyTestForm({ sessionPickerDate: todayIso() }));
  }, [open, mode, initial?.id]);

  const catalogQuery = useQuery({
    queryKey: ["tests-teacher-catalog"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [classes, grades] = await Promise.all([
        TeacherCatalogService.listClasses(),
        TeacherCatalogService.listGrades(),
      ]);
      return { classes, grades };
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["tests-session-options", form.sessionPickerDate],
    enabled: open && Boolean(form.sessionPickerDate),
    staleTime: 30_000,
    queryFn: () => LessonSessionService.getSessionViewsByDate(form.sessionPickerDate),
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (!form.title.trim()) {
      toast.error("عنوان الاختبار مطلوب.");
      return;
    }

    try {
      await onSubmit(formStateToCreateInput(form));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الاختبار.");
    }
  }

  const title =
    mode === "create" ? "إضافة اختبار" : mode === "view" ? "عرض الاختبار" : "تعديل اختبار";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{TEST_STATUS_HINT}</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="test-title">العنوان *</Label>
            <Input
              id="test-title"
              className="min-h-11"
              value={form.title}
              disabled={readOnly}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-instructions">التعليمات</Label>
            <Textarea
              id="test-instructions"
              className="min-h-24"
              value={form.instructions}
              disabled={readOnly}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-subject">المادة</Label>
              <Input
                id="test-subject"
                className="min-h-11"
                value={form.subject}
                disabled={readOnly}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-grade">الصف</Label>
              {(catalogQuery.data?.grades.length ?? 0) > 0 ? (
                <Select
                  value={form.grade || NONE_CATALOG}
                  disabled={readOnly}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      grade: value === NONE_CATALOG ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger id="test-grade" className="min-h-11">
                    <SelectValue placeholder="اختر الصف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATALOG}>بدون صف</SelectItem>
                    {(catalogQuery.data?.grades ?? []).map((grade) => (
                      <SelectItem key={grade.id} value={grade.name}>
                        {grade.name}
                      </SelectItem>
                    ))}
                    {form.grade &&
                    !(catalogQuery.data?.grades ?? []).some((g) => g.name === form.grade) ? (
                      <SelectItem value={form.grade}>{form.grade}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="test-grade"
                  className="min-h-11"
                  value={form.grade}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-class">الفصل</Label>
              {(catalogQuery.data?.classes.length ?? 0) > 0 ? (
                <Select
                  value={form.className || NONE_CATALOG}
                  disabled={readOnly}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      className: value === NONE_CATALOG ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger id="test-class" className="min-h-11">
                    <SelectValue placeholder="اختر الفصل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATALOG}>بدون فصل</SelectItem>
                    {(catalogQuery.data?.classes ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                    {form.className &&
                    !(catalogQuery.data?.classes ?? []).some((c) => c.name === form.className) ? (
                      <SelectItem value={form.className}>{form.className}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="test-class"
                  className="min-h-11"
                  value={form.className}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-due">تاريخ الاستحقاق</Label>
            <Input
              id="test-due"
              type="date"
              className="min-h-11"
              value={form.dueDate}
              disabled={readOnly}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              ربط اختياري بحصة موجودة (بدون إنشاء حصص جديدة)
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="test-session-date">تاريخ الحصة</Label>
              <Input
                id="test-session-date"
                type="date"
                className="min-h-11"
                value={form.sessionPickerDate}
                disabled={readOnly}
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
              <Label htmlFor="test-session">الحصة المرتبطة</Label>
              <Select
                value={form.lessonSessionId || NONE_SESSION}
                disabled={readOnly}
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
                <SelectTrigger id="test-session" className="min-h-11">
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
            {!readOnly ? (
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy ? "جاري الحفظ…" : mode === "create" ? "إضافة" : "حفظ التعديلات"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {readOnly ? "إغلاق" : "إلغاء"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
