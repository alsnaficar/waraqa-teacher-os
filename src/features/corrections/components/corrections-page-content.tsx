import { Link } from "@tanstack/react-router";
import { ClipboardCheck, FlaskConical, ClipboardList, RefreshCw } from "lucide-react";

import { EmptyState } from "@/shared/components/empty-state";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import { useCorrectionsInbox } from "../hooks/useCorrectionsInbox";
import {
  CORRECTIONS_EMPTY_DESCRIPTION,
  CORRECTIONS_EMPTY_TITLE,
  CORRECTIONS_ERROR_TITLE,
  CORRECTIONS_HINT,
  formatCorrectionSubmittedAt,
  type CorrectionInboxItem,
} from "../services/corrections-inbox.logic";

export function CorrectionsPageContent() {
  const { items, loading, error, refresh } = useCorrectionsInbox();

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">التصحيح</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                تسليمات الواجبات والاختبارات التي تحتاج إجراءً منك.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{CORRECTIONS_HINT}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="min-h-11 px-3 text-sm">
              {loading ? "…" : `${items.length} يحتاج تصحيحاً`}
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-1"
              onClick={() => refresh()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState
          icon={ClipboardCheck}
          title={CORRECTIONS_ERROR_TITLE}
          description={error instanceof Error ? error.message : "حاول مرة أخرى."}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={CORRECTIONS_EMPTY_TITLE}
          description={CORRECTIONS_EMPTY_DESCRIPTION}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InboxCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function InboxCard({ item }: { item: CorrectionInboxItem }) {
  const Icon = item.source === "homework" ? ClipboardList : FlaskConical;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{item.sourceLabel}</Badge>
                <Badge variant="secondary">{item.statusLabel}</Badge>
              </div>
              <h2 className="truncate text-base font-bold">{item.title}</h2>
              <p className="text-sm text-muted-foreground">{item.studentName}</p>
              <p className="text-xs text-muted-foreground">
                تاريخ التسليم: {formatCorrectionSubmittedAt(item.submittedAt)}
              </p>
            </div>
          </div>
        </div>

        <Button asChild className="min-h-11 w-full sm:w-auto">
          {item.source === "homework" ? (
            <Link to="/homework" search={{ homeworkId: item.parentId }}>
              فتح للتصحيح
            </Link>
          ) : (
            <Link to="/tests" search={{ testId: item.parentId }}>
              فتح للتصحيح
            </Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
