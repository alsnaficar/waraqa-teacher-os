import { CalendarDays, Eye } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import type { Lesson } from "./types";

interface WeeklySummaryCardProps {
  lessons: Lesson[];
}

function StatCol({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-border p-2">
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function WeeklySummaryCard({ lessons }: { lessons: Lesson[] }) {
  const totalLessons = lessons.length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-end gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-blue-700">
        <span className="text-sm font-bold">ملخص الأسبوع</span>
        <CalendarDays className="h-4 w-4" />
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCol label="الدروس" value={String(totalLessons)} />
          <StatCol label="الواجبات" value="5" />
          <StatCol label="الاختبارات" value="2" />
          <StatCol label="المعدل" value="88%" />
        </div>
        <Button variant="outline" className="w-full gap-2 min-h-0">
          <Eye className="h-4 w-4 text-primary" />
          معاينة التقرير
        </Button>
      </CardContent>
    </Card>
  );
}
