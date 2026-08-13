import { CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/shared/ui/card";

/**
 * Teacher Settings calendar placeholder.
 * Teachers cannot create, activate, or edit academic years/semesters.
 * Official teacher read lands after the later data/RLS step.
 */
export function AcademicCalendarSettingsSection() {
  return (
    <Card className="shadow-sm border-slate-100">
      <CardContent className="p-6 space-y-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          السنة الدراسية والفصول
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          التقويم الدراسي معتمد مركزياً من الإدارة. لا يمكن للمعلم إنشاء السنة أو تفعيلها أو إضافة
          الفصول من الإعدادات.
        </p>
        <p className="text-xs font-bold text-slate-600">لم يُعتمد التقويم الدراسي بعد</p>
      </CardContent>
    </Card>
  );
}
