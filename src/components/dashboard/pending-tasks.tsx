import { Link } from "@tanstack/react-router";
import { ClipboardCheck, Loader2 } from "lucide-react";

import {
  DASHBOARD_PENDING_EMPTY_DESCRIPTION,
  DASHBOARD_PENDING_EMPTY_TITLE,
  DASHBOARD_VIEW_ALL_CORRECTIONS,
  type DashboardPendingTask,
} from "@/features/dashboard/services/dashboard-activity.logic";
import { EmptyState } from "@/shared/components/empty-state";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export function PendingTasks({
  tasks,
  loading,
  error,
  onRetry,
}: {
  tasks: DashboardPendingTask[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">المهام المعلقة</h2>
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/corrections">{DASHBOARD_VIEW_ALL_CORRECTIONS}</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحميل…
          </div>
        ) : error ? (
          <EmptyState
            icon={ClipboardCheck}
            title="تعذر تحميل المهام"
            description={error.message}
            action={
              onRetry ? (
                <Button type="button" className="min-h-11" onClick={onRetry}>
                  إعادة المحاولة
                </Button>
              ) : undefined
            }
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={DASHBOARD_PENDING_EMPTY_TITLE}
            description={DASHBOARD_PENDING_EMPTY_DESCRIPTION}
          />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  to={task.href.startsWith("/tests") ? "/tests" : "/homework"}
                  search={parseParentSearch(task.href)}
                  className="flex min-h-[44px] flex-col gap-0.5 rounded-xl border bg-muted/20 px-3 py-2 transition hover:bg-muted/40"
                >
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.studentName} · {task.actionLabel}
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
