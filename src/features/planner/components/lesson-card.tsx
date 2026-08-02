import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BookOpen,
  FlaskConical,
  ClipboardList,
  Globe,
  PlaySquare,
  Target,
  Trash2,
} from "lucide-react";
import { getLessonCatalog } from "@/features/curriculum/lesson-catalog";
import { Badge } from "@/shared/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/utils";
import type { LessonOverrideScope } from "@/features/planner/services/overrides";
import type { Lesson } from "./types";
import type { EducationStage } from "@/features/ai/components/curriculum-selector";

// Map the compact mock grade (e.g. "أول متوسط") to curriculum selector values.
function mapLessonToCurriculum(lesson: Lesson): {
  stage?: EducationStage;
  grade?: string;
} {
  const g = lesson.grade;
  if (g.includes("متوسط")) {
    const map: Record<string, string> = {
      "أول متوسط": "الصف الأول المتوسط",
      "ثاني متوسط": "الصف الثاني المتوسط",
      "ثالث متوسط": "الصف الثالث المتوسط",
    };
    return { stage: "intermediate", grade: map[g] };
  }
  if (g.includes("ابتدائي")) return { stage: "primary" };
  if (g.includes("ثانوي")) return { stage: "secondary" };
  return {};
}

const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-600 hover:bg-emerald-50",
  blue: "text-blue-500 hover:bg-blue-50",
  orange: "text-orange-500 hover:bg-orange-50",
  purple: "text-purple-500 hover:bg-purple-50",
  red: "text-red-500 hover:bg-red-50",
  indigo: "text-indigo-500 hover:bg-indigo-50",
  violet: "text-violet-600 hover:bg-violet-50",
  green: "text-green-600 hover:bg-green-50",
};

interface IconBtnProps {
  icon: React.ReactNode;
  tone: keyof typeof TONE_TEXT;
  label: string;
  onClick?: () => void;
}

function IconBtn({ icon, tone, label, onClick }: IconBtnProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "grid h-[22px] w-[22px] sm:h-[18px] sm:w-[18px] place-items-center rounded transition-colors",
            TONE_TEXT[tone],
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface LessonCardProps {
  lesson: Lesson;
  onChangeLesson: (lesson: Lesson, newTitle: string, scope: LessonOverrideScope) => void;
}

export function LessonCard({ lesson, onChangeLesson }: LessonCardProps) {
  const navigate = useNavigate();
  const mapped = mapLessonToCurriculum(lesson);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [scope, setScope] = useState<LessonOverrideScope>("day");

  const units = useMemo(
    () => getLessonCatalog({ stage: mapped.stage, grade: mapped.grade, subject: undefined }),
    [mapped.stage, mapped.grade],
  );
  const currentTitle = pendingTitle ?? lesson.title;
  const comingSoon = (label: string) => toast(`${label} — قريباً`);

  const openLesson = () =>
    navigate({
      to: "/ai-lesson-plan",
      search: { ...mapped, title: currentTitle },
    });

  const openWorksheet = () =>
    navigate({
      to: "/ai-worksheet",
      search: { ...mapped, title: currentTitle },
    });

  const openEnrichment = () =>
    navigate({
      to: "/ai-enrichment",
      search: { ...mapped, title: currentTitle },
    });

  const handleSelect = (title: string) => {
    if (title === lesson.title) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(false);
    setPendingTitle(title);
    setScope("day");
    setScopeOpen(true);
  };

  const confirmScope = () => {
    if (!pendingTitle) return;
    onChangeLesson(lesson, pendingTitle, scope);
    setPendingTitle(null);
    setScopeOpen(false);
  };

  const sum = lesson.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const statuses = ["unprepared", "in-progress", "prepared", "published"] as const;
  const status = statuses[sum % statuses.length];

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-0.5 rounded border border-border/70 bg-card p-0.5 pb-1.5 sm:p-1 sm:pb-2 shadow-sm transition-all hover:shadow-md",
        "border-r-[2px]",
        status === "unprepared" && "border-r-slate-300",
        status === "in-progress" && "border-r-amber-400",
        status === "prepared" && "border-r-blue-400",
        status === "published" && "border-r-emerald-400",
      )}
    >
      <div className="flex items-center justify-center mb-0.5 gap-0.5">
        <Badge
          variant="secondary"
          className="text-[7.5px] sm:text-[9px] h-3 sm:h-4 px-1 rounded-sm leading-none bg-muted/60 text-muted-foreground whitespace-nowrap overflow-hidden"
        >
          {lesson.grade} {lesson.klass}
        </Badge>
      </div>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full flex-1 items-center justify-center gap-0.5 rounded px-0.5 text-center text-[9px] font-bold text-foreground hover:bg-muted/60 min-h-0 sm:text-[10px]"
            title={lesson.title}
          >
            <span className="text-center truncate leading-tight whitespace-normal line-clamp-2">
              {lesson.title}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-64 p-0" dir="rtl">
          <Command>
            <CommandInput placeholder="ابحث عن درس..." />
            <CommandList>
              <CommandEmpty>لا توجد نتائج</CommandEmpty>
              {units.map((unit) => (
                <CommandGroup key={unit.title} heading={unit.title}>
                  {unit.lessons.map((l) => (
                    <CommandItem
                      key={`${unit.title}-${l.title}`}
                      value={`${unit.title} ${l.title}`}
                      onSelect={() => handleSelect(l.title)}
                      className="min-h-0"
                    >
                      {l.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex items-center justify-between gap-0 pt-1 mt-auto border-t border-border/50">
        <IconBtn
          icon={<BookOpen className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="emerald"
          label="الواجب"
          onClick={openWorksheet}
        />
        <IconBtn
          icon={<FlaskConical className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="purple"
          label="الاختبار"
          onClick={() => comingSoon("الاختبار")}
        />
        <IconBtn
          icon={<ClipboardList className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="orange"
          label="الإثراء"
          onClick={openEnrichment}
        />
        <IconBtn
          icon={<Globe className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="blue"
          label="النشاط"
          onClick={() => comingSoon("النشاط")}
        />
        <IconBtn
          icon={<PlaySquare className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="indigo"
          label="الوسائل"
          onClick={() => comingSoon("الوسائل")}
        />
        <IconBtn
          icon={<Target className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="red"
          label="الاستراتيجيات"
          onClick={() => comingSoon("الاستراتيجيات")}
        />
        <IconBtn
          icon={<Trash2 className="h-[12px] w-[12px] sm:h-[10px] sm:w-[10px]" />}
          tone="red"
          label="الحذف"
          onClick={() => comingSoon("الحذف")}
        />
      </div>

      <Dialog
        open={scopeOpen}
        onOpenChange={(o) => {
          setScopeOpen(o);
          if (!o) setPendingTitle(null);
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>هل تريد تطبيق هذا التغيير على:</DialogTitle>
          </DialogHeader>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as LessonOverrideScope)}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 min-h-0">
              <RadioGroupItem id={`scope-day-${lesson.id}`} value="day" />
              <Label htmlFor={`scope-day-${lesson.id}`}>هذا اليوم فقط</Label>
            </div>
            <div className="flex items-center gap-2 min-h-0">
              <RadioGroupItem id={`scope-future-${lesson.id}`} value="future" />
              <Label htmlFor={`scope-future-${lesson.id}`}>جميع الأسابيع القادمة</Label>
            </div>
            <div className="flex items-center gap-2 min-h-0">
              <RadioGroupItem id={`scope-dist-${lesson.id}`} value="distribution" />
              <Label htmlFor={`scope-dist-${lesson.id}`}>
                تحديث التوزيع الدراسي (لمن يملك الصلاحية)
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={confirmScope} className="min-h-0">
              تأكيد
            </Button>
            <Button
              variant="outline"
              className="min-h-0"
              onClick={() => {
                setScopeOpen(false);
                setPendingTitle(null);
              }}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
