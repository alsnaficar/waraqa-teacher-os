import { ArrowDown, ArrowUp, FlaskConical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/shared/components/empty-state";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Textarea } from "@/shared/ui/textarea";

import { useTestQuestions } from "../hooks/useTestQuestions";
import {
  draftToQuestionCreateInput,
  emptyQuestionDraft,
  moveQuestionDraft,
  questionToDraft,
  TEST_QUESTION_TYPE_LABELS,
  validateQuestionDraft,
  type QuestionDraft,
} from "../services/tests-ui.logic";
import type { TestQuestionType } from "../services/test-question.service";

export function TestQuestionBuilder({
  testId,
  testTitle,
  readOnly = false,
}: {
  testId: string;
  testTitle: string;
  readOnly?: boolean;
}) {
  const { items, loading, error, refresh, replaceAll } = useTestQuestions(testId);
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    setDrafts(items.map(questionToDraft));
  }, [items]);

  async function handleSave() {
    for (const draft of drafts) {
      const message = validateQuestionDraft(draft);
      if (message) {
        toast.error(message);
        return;
      }
    }

    try {
      const payload = drafts.map((draft, index) => draftToQuestionCreateInput(draft, index));
      await replaceAll.mutateAsync(payload);
      toast.success("تم حفظ الأسئلة.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الأسئلة.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="تعذر تحميل الأسئلة"
        description={error instanceof Error ? error.message : "حاول مرة أخرى."}
        action={
          <Button className="min-h-11" onClick={() => void refresh()}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">أسئلة الاختبار</p>
            <p className="text-[11px] text-muted-foreground truncate">{testTitle}</p>
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1"
                onClick={() => setDrafts((current) => [...current, emptyQuestionDraft()])}
              >
                <Plus className="h-4 w-4" />
                إضافة سؤال
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={replaceAll.isPending}
                onClick={() => void handleSave()}
              >
                {replaceAll.isPending ? "جاري الحفظ…" : "حفظ الأسئلة"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">عرض فقط — الاختبار مغلق.</p>
          )}
        </div>

        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أسئلة بعد.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <QuestionEditor
                key={draft.localId}
                draft={draft}
                index={index}
                readOnly={readOnly}
                canMoveUp={index > 0}
                canMoveDown={index < drafts.length - 1}
                onChange={(next) =>
                  setDrafts((current) =>
                    current.map((row) => (row.localId === draft.localId ? next : row)),
                  )
                }
                onMove={(direction) =>
                  setDrafts((current) => moveQuestionDraft(current, draft.localId, direction))
                }
                onDelete={() =>
                  setDrafts((current) => current.filter((row) => row.localId !== draft.localId))
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionEditor({
  draft,
  index,
  readOnly,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDelete,
}: {
  draft: QuestionDraft;
  index: number;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (draft: QuestionDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">سؤال {index + 1}</p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              disabled={!canMoveUp}
              aria-label="تحريك لأعلى"
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              disabled={!canMoveDown}
              aria-label="تحريك لأسفل"
              onClick={() => onMove(1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-destructive"
              aria-label="حذف السؤال"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>نوع السؤال</Label>
          <Select
            value={draft.type}
            disabled={readOnly}
            onValueChange={(value) => {
              const type = value as TestQuestionType;
              onChange({
                ...draft,
                type,
                options:
                  type === "multiple_choice"
                    ? draft.options.length >= 2
                      ? draft.options
                      : emptyQuestionDraft().options
                    : [],
              });
            }}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TEST_QUESTION_TYPE_LABELS) as TestQuestionType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {TEST_QUESTION_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>الدرجة</Label>
          <Input
            className="min-h-11"
            type="number"
            min={0}
            step="0.5"
            disabled={readOnly}
            value={draft.points}
            onChange={(e) => onChange({ ...draft, points: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>نص السؤال</Label>
        <Textarea
          className="min-h-20"
          disabled={readOnly}
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
        />
      </div>

      {draft.type === "true_false" ? (
        <div className="space-y-1.5">
          <Label>الإجابة الصحيحة</Label>
          <Select
            value={draft.correctBoolean ? "true" : "false"}
            disabled={readOnly}
            onValueChange={(value) =>
              onChange({ ...draft, correctBoolean: value === "true" })
            }
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">صح</SelectItem>
              <SelectItem value="false">خطأ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>الخيارات (اختر إجابة صحيحة واحدة)</Label>
          {draft.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-h-11 min-w-0 flex-1"
                disabled={readOnly}
                placeholder={`الخيار ${optionIndex + 1}`}
                value={option.label}
                onChange={(e) => {
                  const options = draft.options.map((row, i) =>
                    i === optionIndex ? { ...row, label: e.target.value } : row,
                  );
                  onChange({ ...draft, options });
                }}
              />
              <Button
                type="button"
                variant={option.isCorrect ? "default" : "outline"}
                className="min-h-11"
                disabled={readOnly}
                onClick={() => {
                  const options = draft.options.map((row, i) => ({
                    ...row,
                    isCorrect: i === optionIndex,
                  }));
                  onChange({ ...draft, options });
                }}
              >
                {option.isCorrect ? "الصحيحة" : "تعيين صحيحة"}
              </Button>
            </div>
          ))}
          {!readOnly ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() =>
                onChange({
                  ...draft,
                  options: [...draft.options, { label: "", isCorrect: false }],
                })
              }
            >
              إضافة خيار
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
