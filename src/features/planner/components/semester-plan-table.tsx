import { ArrowDown, ArrowUp, CalendarClock } from "lucide-react";

import type { CalculatedLessonEntry } from "../services/planner-engine";
import { uniqueLessons } from "../services/semester-plan.service";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/utils/utils";

const DAY_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface SemesterPlanTableProps {
  entries: CalculatedLessonEntry[];
  busy?: boolean;
  readOnly?: boolean;
  onMoveDate: (lessonId: string, date: string, period: number) => void;
  onShiftOrder: (lessonId: string, direction: "up" | "down") => void;
}

function clip(text: string, max = 80): string {
  const value = text.trim();
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function SemesterPlanTable({
  entries,
  busy = false,
  readOnly = false,
  onMoveDate,
  onShiftOrder,
}: SemesterPlanTableProps) {
  const rows = uniqueLessons(entries);
  const locked = busy || readOnly;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        لا توجد خطة فصل بعد. اضغط «توليد خطة الفصل» لتوزيع دروس المنهج على الأسابيع الدراسية.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <div
        className="min-w-0 rounded-lg border border-border/60 bg-muted/50 px-3 py-2.5 text-center xl:hidden"
        dir="rtl"
        role="note"
        aria-label="اسحب الجدول أفقيًا لعرض بقية الأعمدة"
      >
        <p className="text-xs font-medium leading-relaxed text-muted-foreground sm:text-sm">
          ↔ اسحب الجدول أفقيًا لعرض بقية الأعمدة
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-right">
              <th className="px-2 py-3 font-semibold">الأسبوع</th>
              <th className="px-2 py-3 font-semibold">التاريخ</th>
              <th className="px-2 py-3 font-semibold">الوحدة</th>
              <th className="px-2 py-3 font-semibold">الدرس</th>
              <th className="px-2 py-3 font-semibold">عدد الحصص</th>
              <th className="px-2 py-3 font-semibold">الأهداف العامة</th>
              <th className="px-2 py-3 font-semibold">الوسائل التعليمية</th>
              <th className="px-2 py-3 font-semibold">أساليب التقويم</th>
              <th className="px-2 py-3 font-semibold">ملاحظات</th>
              <th className="px-2 py-3 font-semibold">تعديل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.lessonId ?? row.id}
                className={cn(
                  "border-b border-border/70 align-top",
                  index % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <td className="px-2 py-2.5 tabular-nums">
                  {row.teachingWeek || row.weekNumber}
                  <div className="text-[11px] text-muted-foreground">
                    {DAY_LABELS[row.dayOfWeek] ?? ""} · ح{row.period}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <Input
                    type="date"
                    className="h-11 w-[146px]"
                    value={row.suggestedDate}
                    disabled={locked || !row.lessonId}
                    onChange={(event) => {
                      if (!row.lessonId || readOnly) return;
                      onMoveDate(row.lessonId, event.target.value, row.period);
                    }}
                  />
                </td>
                <td className="px-2 py-2.5">{row.unit || "—"}</td>
                <td className="px-2 py-2.5 font-medium">
                  {row.lessonTitle.replace(/ \(جزء \d+\)$/, "")}
                </td>
                <td className="px-2 py-2.5">
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    className="h-11 w-16"
                    value={row.periodsCount}
                    disabled
                    title="عدد الحصص من المنهج"
                  />
                </td>
                <td className="max-w-[160px] px-2 py-2.5 text-xs leading-5" title={row.objectives}>
                  {clip(row.objectives)}
                </td>
                <td
                  className="max-w-[140px] px-2 py-2.5 text-xs leading-5"
                  title={row.teachingResources}
                >
                  {clip(row.teachingResources)}
                </td>
                <td
                  className="max-w-[140px] px-2 py-2.5 text-xs leading-5"
                  title={row.assessmentMethods}
                >
                  {clip(row.assessmentMethods)}
                </td>
                <td className="max-w-[120px] px-2 py-2.5 text-xs leading-5" title={row.planNotes}>
                  {clip(row.planNotes, 60)}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-11 w-11"
                      disabled={locked || !row.lessonId || index === 0}
                      aria-label="تحريك لأعلى"
                      onClick={() => row.lessonId && !readOnly && onShiftOrder(row.lessonId, "up")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-11 w-11"
                      disabled={locked || !row.lessonId || index === rows.length - 1}
                      aria-label="تحريك لأسفل"
                      onClick={() =>
                        row.lessonId && !readOnly && onShiftOrder(row.lessonId, "down")
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          {rows.length} درساً — المصدر: خطة الفصل المخزّنة في planner_entries
        </p>
      </div>
    </div>
  );
}
