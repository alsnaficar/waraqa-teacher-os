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
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

import type { TestSubmission } from "../services/test-submission.service";

export function TestFeedbackDialog({
  open,
  submission,
  studentName,
  testTitle,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  submission: TestSubmission | null;
  studentName: string;
  testTitle?: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (feedback: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open || !submission) return;
    setFeedback(submission.feedback ?? "");
  }, [open, submission?.id, submission?.feedback]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submission) return;
    try {
      await onSubmit(feedback);
      toast.success("تم حفظ الملاحظة.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الملاحظة.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>ملاحظات المعلم</DialogTitle>
          <DialogDescription>
            ملاحظات بعد التصحيح التلقائي لـ {studentName || "الطالب"}
            {testTitle ? ` — ${testTitle}` : ""}. لا تغيّر الدرجة أو الإجابات.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="test-feedback">الملاحظة</Label>
            <Textarea
              id="test-feedback"
              className="min-h-28"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="اكتب ملاحظة للطالب أو لنفسك…"
              disabled={busy}
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" className="min-h-11 w-full" disabled={busy || !submission}>
              {busy ? "جاري الحفظ…" : "حفظ الملاحظة"}
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
