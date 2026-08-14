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
import { Textarea } from "@/shared/ui/textarea";

import type {
  HomeworkGradeInput,
  HomeworkSubmission,
} from "../services/homework-submission.service";
import { gradingActionLabel } from "../services/students-ui.logic";

export function HomeworkGradeDialog({
  open,
  submission,
  studentName,
  maxScore,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  submission: HomeworkSubmission | null;
  studentName: string;
  maxScore?: number | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: HomeworkGradeInput) => Promise<void>;
}) {
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open || !submission) return;
    setScore(submission.score == null ? "" : String(submission.score));
    setFeedback(submission.feedback ?? "");
  }, [open, submission?.id, submission?.score, submission?.feedback]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submission) return;

    const trimmed = score.trim();
    if (!trimmed) {
      toast.error("الدرجة مطلوبة.");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      toast.error("الدرجة يجب أن تكون رقماً.");
      return;
    }

    try {
      await onSubmit({
        score: parsed,
        feedback,
        maxScore: maxScore ?? null,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التصحيح.");
    }
  }

  const title = submission ? gradingActionLabel(submission.status) : "تصحيح";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            تصحيح يدوي لتسليم {studentName || "الطالب"}. لا يُرسل معرّف المعلم من الواجهة.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="grade-score">الدرجة</Label>
            <Input
              id="grade-score"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              max={maxScore != null ? maxScore : undefined}
              className="min-h-11"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
          </div>

          {maxScore != null ? (
            <div className="space-y-1.5">
              <Label htmlFor="grade-max">الدرجة الكاملة</Label>
              <Input
                id="grade-max"
                className="min-h-11"
                value={String(maxScore)}
                readOnly
                disabled
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="grade-feedback">ملاحظات المعلم</Label>
            <Textarea
              id="grade-feedback"
              className="min-h-24"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="اختياري"
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" className="min-h-11 w-full" disabled={busy}>
              {busy ? "جاري الحفظ…" : "حفظ التصحيح"}
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
