import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, ClipboardList, FlaskConical, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "التقارير | ورقة" },
      {
        name: "description",
        content: "تقارير أداء الحصص والطلاب في منصة ورقة.",
      },
    ],
  }),
});

function ReportsPage() {
  return (
    <PageShell>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">التقارير</h1>
              <p className="mt-1 text-xs text-muted-foreground">ملخصات أسبوعية عن حصصك وأنشطتك.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat icon={CheckCircle2} label="دروس منجزة" value={0} />
        <MiniStat icon={ClipboardList} label="واجبات أُنشئت" value={0} />
        <MiniStat icon={FlaskConical} label="اختبارات أُنشئت" value={0} />
        <MiniStat icon={BarChart3} label="تقارير أُرسلت" value={0} />
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <Badge variant="secondary">قريباً</Badge>
          <p className="text-sm text-muted-foreground">
            ستظهر هنا تقارير مفصّلة عن الأداء الأسبوعي بمجرد ربط البيانات.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate text-[11px]">{label}</span>
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
