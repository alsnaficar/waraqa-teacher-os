import { useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CurriculumSelection, validateCurriculum } from "./curriculum-selector";
import { AIDifficulty, AIHomeworkType, FieldErrors } from "@/features/ai/components/types";
import { copyToClipboard, downloadArabicDocx } from "@/platform/ai/docx";
import { supabase } from "@/platform/database/supabase/client";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
} from "@/features/planner/services/planner-engine";

// 1. useAIClipboard hook
export function useAIClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    if (!text) return false;
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return { copy, copied };
}

// 2. useAIExport hook
export function useAIExport() {
  const [exporting, setExporting] = useState(false);

  const downloadDocx = async (params: {
    title: string;
    subtitle?: string;
    content: string;
    filename?: string;
  }) => {
    if (!params.content) return;
    setExporting(true);
    try {
      await downloadArabicDocx(params);
    } finally {
      setExporting(false);
    }
  };

  return { downloadDocx, exporting };
}

// 3. useAIGeneration hook
interface UseAIGenerationParams<TForm extends Record<string, unknown>> {
  initialCurriculum: CurriculumSelection;
  initialTitle: string;
  initialQuestionCount?: string;
  initialDifficulty?: AIDifficulty;
  initialObjectives?: string;
  initialHomeworkType?: AIHomeworkType;
  initialEstimatedTime?: string;
  schema: z.ZodSchema<TForm>;
  mutation: {
    mutate: (data: TForm) => void;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: { content: string } | null | undefined;
  };
  transformData?: (rawData: Record<string, unknown>) => Record<string, unknown>;
}

export function useAIGeneration<TForm extends Record<string, unknown>>({
  initialCurriculum,
  initialTitle,
  initialQuestionCount = "10",
  initialDifficulty = "medium",
  initialObjectives = "",
  initialHomeworkType = "mixed",
  initialEstimatedTime = "30",
  schema,
  mutation,
  transformData,
}: UseAIGenerationParams<TForm>) {
  const [curriculum, setCurriculum] = useState<CurriculumSelection>(initialCurriculum);
  const [title, setTitle] = useState(initialTitle);
  const [questionCount, setQuestionCount] = useState(initialQuestionCount);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);
  const [objectives, setObjectives] = useState(initialObjectives);
  const [homeworkType, setHomeworkType] = useState<AIHomeworkType>(initialHomeworkType);
  const [estimatedTime, setEstimatedTime] = useState(initialEstimatedTime);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [editedContent, setEditedContent] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");

  // Automatically load today's lesson if initialTitle is empty
  useEffect(() => {
    if (initialTitle) return;

    async function loadTodayLesson() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date();
        const todayISO = today.toISOString().slice(0, 10);

        const { data: entries, error } = await supabase
          .from("planner_entries")
          .select("notes")
          .eq("user_id", user.id)
          .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
          .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE);

        if (error || !entries) return;

        const todayEntry = entries
          .map((e) => {
            try {
              return JSON.parse(e.notes || "{}");
            } catch {
              return {};
            }
          })
          .find((notes) => notes.suggestedDate === todayISO && notes.status !== "Skipped");

        if (todayEntry && todayEntry.lessonTitle) {
          const g = todayEntry.className || "";
          let computedStage: "primary" | "intermediate" | "secondary" = "primary";
          if (g.includes("متوسط")) {
            computedStage = "intermediate";
          } else if (g.includes("ثانوي")) {
            computedStage = "secondary";
          }

          setCurriculum({
            stage: computedStage,
            grade: todayEntry.className || "",
            subject: todayEntry.subject || "",
            semester: todayEntry.semester || "",
          });
          setTitle(todayEntry.lessonTitle);
          setObjectives(todayEntry.objectives || "");
          toast.success(`تم تحميل درس اليوم المجدول تلقائياً: ${todayEntry.lessonTitle}`);
        }
      } catch (err) {
        console.warn("Failed to auto-load today's lesson:", err);
      }
    }

    loadTodayLesson();
  }, [initialTitle]);

  // Synchronize edited content with generated result when mutation completes successfully
  useEffect(() => {
    if (mutation.data?.content) {
      setEditedContent(mutation.data.content);
      setActiveTab("preview");
    }
  }, [mutation.data?.content]);

  const validateAndGenerate = () => {
    const curriculumErrors = validateCurriculum(curriculum) ?? {};

    // Prepare data to parse
    const rawData: Record<string, unknown> = {
      stage: curriculum.stage || undefined,
      semester: curriculum.semester || undefined,
      grade: curriculum.grade,
      subject: curriculum.subject,
      title,
      questionCount: questionCount ? Number(questionCount) : undefined,
      difficulty,
      objectives: objectives || undefined,
      homeworkType: homeworkType || undefined,
      estimatedTime: estimatedTime ? Number(estimatedTime) : undefined,
    };

    const finalRawData = transformData ? transformData(rawData) : rawData;
    const parsed = schema.safeParse(finalRawData);

    const fieldErrors: FieldErrors = { ...curriculumErrors };
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    mutation.mutate(parsed.data!);
    return true;
  };

  return {
    curriculum,
    setCurriculum,
    title,
    setTitle,
    questionCount,
    setQuestionCount,
    difficulty,
    setDifficulty,
    objectives,
    setObjectives,
    homeworkType,
    setHomeworkType,
    estimatedTime,
    setEstimatedTime,
    errors,
    setErrors,
    editedContent,
    setEditedContent,
    activeTab,
    setActiveTab,
    validateAndGenerate,
  };
}
