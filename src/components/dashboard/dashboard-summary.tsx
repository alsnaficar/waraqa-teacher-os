import { BookOpen, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";

interface DashboardSummaryProps {
  todayLessons: number;
  weekLessons: number;
  completedLessons: number;
  remainingLessons: number;
}

export function DashboardSummary({
  todayLessons,
  weekLessons,
  completedLessons,
  remainingLessons,
}: DashboardSummaryProps) {
  const cards = [
    {
      title: "حصص اليوم",
      value: todayLessons,
      icon: CalendarDays,
    },
    {
      title: "حصص الأسبوع",
      value: weekLessons,
      icon: BookOpen,
    },
    {
      title: "تم تحضيرها",
      value: completedLessons,
      icon: CheckCircle2,
    },
    {
      title: "المتبقي",
      value: remainingLessons,
      icon: Clock,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{card.value}</span>
              </div>

              <div className="mt-3 text-sm text-muted-foreground">{card.title}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
