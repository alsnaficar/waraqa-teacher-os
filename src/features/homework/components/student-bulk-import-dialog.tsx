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
import { Textarea } from "@/shared/ui/textarea";

import type { Student } from "../services/student.service";
import {
  formatStudentImportSummary,
  parseStudentImportText,
  planStudentImport,
  STUDENT_BULK_IMPORT_MAX,
  summarizeStudentImport,
} from "../services/student-bulk-import.logic";

export function StudentBulkImportDialog({
  open,
  classId,
  classLabel,
  gradeId,
  existingInClass,
  busy,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  classId: string;
  classLabel: string;
  gradeId: string | null;
  existingInClass: Student[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (input: {
    classId: string;
    gradeId: string | null;
    rows: Array<{ fullName: string; studentCode?: string | null }>;
  }) => Promise<{
    created: Student[];
    failures: Array<{ fullName: string; message: string }>;
  }>;
}) {
  const [text, setText] = useState("");

  const preview = useMemo(() => {
    const parsed = parseStudentImportText(text);
    const plan = planStudentImport(parsed.rows, existingInClass, {
      truncated: parsed.truncated,
    });
    return { parsed, plan };
  }, [text, existingInClass]);

  async function handleImport() {
    if (!classId) {
      toast.error("يجب اختيار فصل قبل الاستيراد.");
      return;
    }

    const createRows = preview.plan.items
      .filter((item) => item.action === "create")
      .map((item) => ({
        fullName: item.fullName,
        studentCode: item.studentCode,
      }));

    if (createRows.length === 0) {
      toast.error("لا توجد أسماء صالحة للإضافة.");
      return;
    }

    try {
      const result = await onImport({
        classId,
        gradeId,
        rows: createRows,
      });

      const summary = summarizeStudentImport(preview.plan, result.created.length);
      // Runtime failures (e.g. code conflict) count toward invalid-ish messaging
      const failureNote =
        result.failures.length > 0 ? ` · فشل ${result.failures.length}` : "";
      toast.success(`${formatStudentImportSummary(summary)}${failureNote}`);
      setText("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استيراد الطلاب.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>استيراد طلاب باللصق</DialogTitle>
          <DialogDescription>
            الصق اسماً في كل سطر لإضافتهم إلى فصل «{classLabel}». الحد الأقصى{" "}
            {STUDENT_BULK_IMPORT_MAX} اسماً صالحاً. يمكنك اختيارياً كتابة{" "}
            <span className="font-mono text-[11px]">الاسم,الرمز</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-students">قائمة الأسماء</Label>
            <Textarea
              id="bulk-students"
              className="min-h-40"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"أحمد محمد\nخالد علي\nسعد عبدالله"}
              disabled={busy}
            />
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <p>سيتم إضافة: {preview.plan.createCount}</p>
            <p>مكرر في القائمة: {preview.plan.batchDuplicateCount}</p>
            <p>موجود مسبقاً في الفصل: {preview.plan.alreadyExistsCount}</p>
            <p>غير صالح: {preview.plan.invalidCount}</p>
            {preview.plan.truncated ? (
              <p className="text-amber-700">
                تم الاقتصار على أول {STUDENT_BULK_IMPORT_MAX} اسماً صالحاً.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-start">
          <Button
            type="button"
            className="min-h-11"
            disabled={busy || preview.plan.createCount === 0}
            onClick={() => void handleImport()}
          >
            {busy ? "جاري الاستيراد…" : `إضافة ${preview.plan.createCount}`}
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
