import { Clock, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { CurriculumSelector, CurriculumSelection } from "./curriculum-selector";
import { AIDifficulty, AIHomeworkType, FieldErrors } from "@/features/ai/components/types";
import { supabase } from "@/platform/database/supabase/client";
import { type Assignment } from "@/routes/_authenticated/settings";

interface AIGenerationFormProps {
  curriculum: CurriculumSelection;
  onCurriculumChange: (value: CurriculumSelection) => void;
  title: string;
  onTitleChange: (value: string) => void;
  questionCount: string;
  onQuestionCountChange: (value: string) => void;
  difficulty: AIDifficulty;
  onDifficultyChange: (value: AIDifficulty) => void;
  objectives: string;
  onObjectivesChange: (value: string) => void;
  homeworkType?: AIHomeworkType;
  onHomeworkTypeChange?: (value: AIHomeworkType) => void;
  estimatedTime?: string;
  onEstimatedTimeChange?: (value: string) => void;
  errors: FieldErrors;
  isPending: boolean;
  hasData: boolean;
  onSubmit: () => void;
  submitButtonText?: string;
  titleLabel?: string;
  titlePlaceholder?: string;
  showObjectives?: boolean;
  showHomeworkType?: boolean;
  showDifficulty?: boolean;
  showQuestionCount?: boolean;
  showEstimatedTime?: boolean;
}

export function AIGenerationForm({
  curriculum,
  onCurriculumChange,
  title,
  onTitleChange,
  questionCount,
  onQuestionCountChange,
  difficulty,
  onDifficultyChange,
  objectives,
  onObjectivesChange,
  homeworkType = "mixed",
  onHomeworkTypeChange,
  estimatedTime = "30",
  onEstimatedTimeChange,
  errors,
  isPending,
  hasData,
  onSubmit,
  submitButtonText,
  titleLabel = "عنوان الدرس",
  titlePlaceholder = "مثال: الكسور المتكافئة أو الصلاة وأركانها",
  showObjectives = true,
  showHomeworkType = true,
  showDifficulty = true,
  showQuestionCount = true,
  showEstimatedTime = true,
}: AIGenerationFormProps) {
  const canSubmit = !isPending;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<string>("");

  useEffect(() => {
    async function fetchAssignments() {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("classes, subject, grade")
        .eq("id", userRes.user.id)
        .maybeSingle();

      if (profile) {
        let list: Assignment[] = [];
        const classes = (profile.classes as Record<string, unknown>) || {};
        if (Array.isArray(classes.assignments)) {
          list = classes.assignments as Assignment[];
        } else if (profile.subject || profile.grade) {
          const grade = profile.grade || "";
          const subject = profile.subject || "";
          const stage = grade.includes("متوسط")
            ? "intermediate"
            : grade.includes("ثانوي")
              ? "secondary"
              : "primary";
          list = [
            {
              stage,
              grade,
              subject,
              klasses: ["أ"],
            },
          ];
        }
        setAssignments(list);
      }
    }
    fetchAssignments();
  }, []);

  return (
    <div id="ai-generation-form-container" className="space-y-5">
      {assignments.length > 0 && (
        <div className="space-y-1.5 border-b pb-4 mb-4">
          <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            اختر من المواد والصفوف المسندة لك لتعبئة البيانات تلقائياً
          </Label>
          <Select
            value={selectedIdx}
            onValueChange={(val) => {
              setSelectedIdx(val);
              const idx = parseInt(val, 10);
              const selected = assignments[idx];
              if (selected) {
                onCurriculumChange({
                  stage: selected.stage,
                  grade: selected.grade,
                  subject: selected.subject,
                  semester: curriculum.semester,
                });
              }
            }}
          >
            <SelectTrigger className="h-10 text-xs bg-slate-50/50 border-dashed border-slate-200">
              <SelectValue placeholder="اختر الإسناد للتعبئة التلقائية..." />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {assignments.map((asm, idx) => (
                <SelectItem key={idx} value={String(idx)} className="text-xs">
                  {asm.subject} - {asm.grade}{" "}
                  {asm.klasses?.length > 0 ? `(فصول: ${asm.klasses.join(", ")})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <CurriculumSelector value={curriculum} onChange={onCurriculumChange} errors={errors} />

      <div className="space-y-2">
        <Label htmlFor="title" className="font-semibold text-slate-700 dark:text-slate-300">
          {titleLabel}
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          aria-invalid={!!errors.title}
        />
        {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
      </div>

      {showObjectives && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="objectives"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              أهداف التعلم ومخرجاته (اختياري)
            </Label>
            <span className="text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
              تخصيص ذكي
            </span>
          </div>
          <Textarea
            id="objectives"
            value={objectives}
            onChange={(e) => onObjectivesChange(e.target.value)}
            placeholder="مثال: تحديد وحساب الكسور المتكافئة، استخدام خط الأعداد لتمثيل الكسور..."
            className="h-20 resize-none text-right"
            maxLength={1000}
            dir="rtl"
          />
          {errors.objectives ? (
            <p className="text-xs text-destructive">{errors.objectives}</p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {showHomeworkType && onHomeworkTypeChange && (
          <div className="space-y-2">
            <Label
              htmlFor="homeworkType"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              نوع الأسئلة
            </Label>
            <Select
              value={homeworkType}
              onValueChange={(v) => onHomeworkTypeChange(v as AIHomeworkType)}
            >
              <SelectTrigger id="homeworkType" aria-invalid={!!errors.homeworkType}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mixed">مختلط (أسئلة متنوعة)</SelectItem>
                <SelectItem value="mcq">اختيار من متعدد</SelectItem>
                <SelectItem value="true_false">صواب أو خطأ</SelectItem>
                <SelectItem value="essay">أسئلة مقالية (إنشائية)</SelectItem>
              </SelectContent>
            </Select>
            {errors.homeworkType ? (
              <p className="text-xs text-destructive">{errors.homeworkType}</p>
            ) : null}
          </div>
        )}

        {showDifficulty && (
          <div className="space-y-2">
            <Label
              htmlFor="difficulty"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              مستوى الصعوبة
            </Label>
            <Select value={difficulty} onValueChange={(v) => onDifficultyChange(v as AIDifficulty)}>
              <SelectTrigger id="difficulty" aria-invalid={!!errors.difficulty}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">سهل</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="hard">صعب</SelectItem>
              </SelectContent>
            </Select>
            {errors.difficulty ? (
              <p className="text-xs text-destructive">{errors.difficulty}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {showQuestionCount && (
          <div className="space-y-2">
            <Label
              htmlFor="questionCount"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              عدد الأسئلة
            </Label>
            <Input
              id="questionCount"
              type="number"
              min={1}
              max={50}
              value={questionCount}
              onChange={(e) => onQuestionCountChange(e.target.value)}
              aria-invalid={!!errors.questionCount}
            />
            {errors.questionCount ? (
              <p className="text-xs text-destructive">{errors.questionCount}</p>
            ) : null}
          </div>
        )}

        {showEstimatedTime && onEstimatedTimeChange && (
          <div className="space-y-2">
            <Label
              htmlFor="estimatedTime"
              className="font-semibold text-slate-700 dark:text-slate-300"
            >
              الوقت المتوقع للحل
            </Label>
            <div className="relative">
              <Input
                id="estimatedTime"
                type="number"
                min={1}
                max={180}
                value={estimatedTime}
                onChange={(e) => onEstimatedTimeChange(e.target.value)}
                aria-invalid={!!errors.estimatedTime}
                className="pl-8"
              />
              <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
            {errors.estimatedTime ? (
              <p className="text-xs text-destructive">{errors.estimatedTime}</p>
            ) : null}
          </div>
        )}
      </div>

      <Button
        id="btn-submit"
        className="w-full h-11 text-base font-medium mt-2"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {isPending ? (
          <Loader2 className="ml-2 h-5 w-5 animate-spin" />
        ) : hasData ? (
          <RefreshCw className="ml-2 h-5 w-5" />
        ) : (
          <Sparkles className="ml-2 h-5 w-5" />
        )}
        {submitButtonText
          ? submitButtonText
          : hasData
            ? "إعادة التوليد ببيانات جديدة"
            : "توليد الواجب المنزلي"}
      </Button>
    </div>
  );
}
