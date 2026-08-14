import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/shared/ui/badge";
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
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/utils";

import { useTestSubmissionAnswers } from "../hooks/useTestSubmissions";
import type { TestQuestion } from "../services/test-question.service";
import type { TestSubmission } from "../services/test-submission.service";
import {
  answersToDraftMap,
  isTestAnswerEntryReadOnly,
  setMcqDraft,
  setTrueFalseDraft,
  type AnswerDraftMap,
} from "../services/tests-submissions-ui.logic";

export function TestAnswerEntryDialog({
  open,
  submission,
  studentName,
  questions,
  questionsLoading,
  busy,
  onOpenChange,
  onSaveAndSubmit,
  onSaveSubmitAndGrade,
}: {
  open: boolean;
  submission: TestSubmission | null;
  studentName: string;
  questions: TestQuestion[];
  questionsLoading?: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAndSubmit: (draft: AnswerDraftMap) => Promise<void>;
  onSaveSubmitAndGrade: (draft: AnswerDraftMap) => Promise<void>;
}) {
  const answersQuery = useTestSubmissionAnswers(open && submission ? submission.id : null);
  const [draft, setDraft] = useState<AnswerDraftMap>({});

  const readOnly = submission ? isTestAnswerEntryReadOnly(submission.status) : true;
  const orderedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.position - b.position),
    [questions],
  );

  useEffect(() => {
    if (!open || !submission) return;
    if (answersQuery.data) {
      setDraft(answersToDraftMap(answersQuery.data));
    } else {
      setDraft({});
    }
  }, [open, submission?.id, answersQuery.data]);

  async function handleSubmitOnly() {
    if (!submission || readOnly) return;
    try {
      await onSaveAndSubmit(draft);
      toast.success("تم حفظ الإجابات وتعليم التسليم كمُسلّم.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التسليم.");
    }
  }

  async function handleSubmitAndGrade() {
    if (!submission || readOnly) return;
    try {
      await onSaveSubmitAndGrade(draft);
      toast.success("تم التسليم والتصحيح التلقائي.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر التسليم والتصحيح.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "عرض إجابات التسليم" : "تسجيل إجابات التسليم"}
          </DialogTitle>
          <DialogDescription>
            الطالب: {studentName || "—"}.{" "}
            {readOnly
              ? "التسليم غير قابل للتعديل بعد التسليم أو التصحيح."
              : "اختر إجابة لكل سؤال ثم علّم التسليم كمُسلّم أو صحّحه تلقائياً."}
          </DialogDescription>
        </DialogHeader>

        {questionsLoading || answersQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : orderedQuestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أسئلة في هذا الاختبار.</p>
        ) : (
          <div className="space-y-4">
            {orderedQuestions.map((question, index) => {
              const value = draft[question.id];
              return (
                <div key={question.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {index + 1}. {question.prompt}
                    </p>
                    <Badge variant="outline">{question.points} درجة</Badge>
                  </div>

                  {question.type === "multiple_choice" ? (
                    <div className="space-y-2">
                      <Label>الخيار</Label>
                      <div className="space-y-2">
                        {question.options.map((option) => {
                          const selected = value?.selectedOptionId === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={readOnly || busy}
                              className={cn(
                                "flex min-h-11 w-full items-center rounded-lg border px-3 text-start text-sm",
                                selected
                                  ? "border-primary bg-primary/10 font-medium"
                                  : "hover:bg-muted/40",
                                (readOnly || busy) && "cursor-default opacity-90",
                              )}
                              onClick={() => {
                                if (readOnly) return;
                                setDraft((current) =>
                                  setMcqDraft(current, question.id, option.id),
                                );
                              }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>الإجابة</Label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: "صواب", value: true },
                          { label: "خطأ", value: false },
                        ].map((option) => {
                          const selected = value?.booleanAnswer === option.value;
                          return (
                            <Button
                              key={option.label}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              className="min-h-11 flex-1"
                              disabled={readOnly || busy}
                              onClick={() => {
                                if (readOnly) return;
                                setDraft((current) =>
                                  setTrueFalseDraft(current, question.id, option.value),
                                );
                              }}
                            >
                              {option.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!readOnly ? (
            <>
              <Button
                type="button"
                className="min-h-11 w-full"
                disabled={busy || questionsLoading || answersQuery.isPending}
                onClick={() => void handleSubmitAndGrade()}
              >
                {busy ? "جاري التنفيذ…" : "تسليم وتصحيح تلقائي"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={busy || questionsLoading || answersQuery.isPending}
                onClick={() => void handleSubmitOnly()}
              >
                تعليم كمُسلّم
              </Button>
            </>
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
      </DialogContent>
    </Dialog>
  );
}
