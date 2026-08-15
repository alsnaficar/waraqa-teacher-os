import { Link } from "@tanstack/react-router";
import { Bell, Loader2 } from "lucide-react";

import {
  DASHBOARD_ACTIVITY_EMPTY_DESCRIPTION,
  DASHBOARD_ACTIVITY_EMPTY_TITLE,
  type DashboardActivityItem,
} from "@/features/dashboard/services/dashboard-activity.logic";
import { formatCorrectionSubmittedAt } from "@/features/corrections/services/corrections-inbox.logic";
import { EmptyState } from "@/shared/components/empty-state";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export function DashboardNotifications({
  items,
  loading,
  error,
  onRetry,
}: {
  items: DashboardActivityItem[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <h2 className="font-bold">النشاط الأخير</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحميل…
          </div>
        ) : error ? (
          <EmptyState
            icon={Bell}
            title="تعذر تحميل النشاط"
            description={error.message}
            action={
              onRetry ? (
                <Button type="button" className="min-h-11" onClick={onRetry}>
                  إعادة المحاولة
                </Button>
              ) : undefined
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={DASHBOARD_ACTIVITY_EMPTY_TITLE}
            description={DASHBOARD_ACTIVITY_EMPTY_DESCRIPTION}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href.startsWith("/tests") ? "/tests" : "/homework"}
                  search={parseParentSearch(item.href)}
                  className="flex min-h-[44px] flex-col gap-0.5 rounded-xl border bg-muted/20 px-3 py-2 transition hover:bg-muted/40"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.title} · {item.studentName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatCorrectionSubmittedAt(item.at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function parseParentSearch(href: string): { homeworkId?: string; testId?: string } {
  try {
    const url = new URL(href, "https://waraqa.local");
    const homeworkId = url.searchParams.get("homeworkId") ?? undefined;
    const testId = url.searchParams.get("testId") ?? undefined;
    return {
      ...(homeworkId ? { homeworkId } : {}),
      ...(testId ? { testId } : {}),
    };
  } catch {
    return {};
  }
}
