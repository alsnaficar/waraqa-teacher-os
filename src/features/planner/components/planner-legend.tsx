import {
  KeyRound,
  BookOpen,
  FlaskConical,
  ClipboardList,
  Globe,
  PlaySquare,
  Target,
  Trash2,
} from "lucide-react";

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground whitespace-nowrap flex-1 min-w-0 w-0">
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <span className="text-[11px] sm:text-[12px] leading-none font-medium text-center w-full truncate">
        {label}
      </span>
    </div>
  );
}

export function PlannerLegend() {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-1 rounded-xl border bg-card px-2 py-2 shadow-sm w-full overflow-hidden">
      <div className="flex flex-col items-center justify-center flex-1 min-w-0 w-0">
        <KeyRound className="h-[14px] w-[14px] text-emerald-700" />
      </div>
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem
        icon={<BookOpen className="h-[14px] w-[14px] text-emerald-600" />}
        label="الواجب"
      />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem
        icon={<FlaskConical className="h-[14px] w-[14px] text-purple-500" />}
        label="الاختبار"
      />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem
        icon={<ClipboardList className="h-[14px] w-[14px] text-orange-500" />}
        label="الإثراء"
      />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem icon={<Globe className="h-[14px] w-[14px] text-blue-500" />} label="النشاط" />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem
        icon={<PlaySquare className="h-[14px] w-[14px] text-indigo-500" />}
        label="الوسائل"
      />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem
        icon={<Target className="h-[14px] w-[14px] text-red-500" />}
        label="الاستراتيجيات"
      />
      <div className="w-[1px] h-8 bg-border/60 shrink-0"></div>
      <LegendItem icon={<Trash2 className="h-[14px] w-[14px] text-red-500" />} label="الحذف" />
    </div>
  );
}
