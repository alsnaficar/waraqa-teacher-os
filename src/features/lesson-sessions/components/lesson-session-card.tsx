import { Link } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, FileText, FlaskConical, Lightbulb, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import type { LessonSessionView } from "../types";
import { LessonSessionStatusBadge } from "./lesson-session-status-badge";

function stageFor(grade: string): "primary" | "intermediate" | "secondary" {
  if (grade.includes("متوسط")) return "intermediate";
  if (grade.includes("ثانوي")) return "secondary";
  return "primary";
}

export const DELETE_PREPARATION_LABEL = "حذف التحضير";
export const CANCEL_PREPARING_LABEL = "إلغاء التحضير";

export interface LessonSessionCardProps {
  session: LessonSessionView;
  onPrepare: (id: string) => void;
  /** Prepared: request confirmed delete. Preparing: cancel in-progress prepare. */
  onResetPreparation: (id: string) => void;
  onComplete: (id: string) => void;
  busy?: boolean;
}

export function LessonSessionCard({
  session,
  onPrepare,
  onResetPreparation,
  onComplete,
  busy = false,
}: LessonSessionCardProps) {
  const shortGrade = session.grade.replace(/^الصف\s+/, "");

  // The AI tools require lessonSessionId (P3 Step 2 Session Binding Contract).
  const aiSearch = {
    lessonSessionId: session.id,
    stage: stageFor(session.grade),
    grade: session.grade,
    subject: session.subject,
    title: session.lessonTitle,
  };

  const isCompleted = session.status === "completed";
  const isPreparing = session.status === "preparing";
  const isPrepared = session.status === "prepared" && session.lessonLocked;
  const canPrepare = session.status === "scheduled" && !session.lessonLocked;
  const canDeletePreparation = isPrepared;
  const canCancelPreparing = isPreparing;

  return (
    <Card>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <span className="text-xs font-medium leading-none">حصة</span>
            <span className="text-sm font-bold leading-tight">{session.periodNumber}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <LessonSessionStatusBadge status={session.status} />

              {shortGrade ? (
                <Badge variant="secondary" className="text-[10px]">
                  {shortGrade}
                </Badge>
              ) : null}

              {session.className ? (
                <span className="text-[10px] text-muted-foreground">{session.className}</span>
              ) : null}
            </div>

            <p className="mt-1.5 text-sm font-semibold leading-snug break-words">
              {session.lessonTitle}
            </p>

            {session.unitTitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground break-words">
                {session.unitTitle}
              </p>
            ) : null}

            {session.startsAt ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {session.startsAt}
                {session.endsAt ? ` - ${session.endsAt}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="h-11 flex-1 min-w-[132px] gap-1.5" asChild>
            <Link to="/ai-lesson-plan" search={aiSearch as never}>
              <BookOpen className="h-4 w-4 text-emerald-600" />
              <span>تحضير الدرس</span>
            </Link>
          </Button>

          <Button variant="outline" size="sm" className="h-11 w-11 shrink-0 p-0" asChild>
            <Link to="/ai-worksheet" search={aiSearch as never} aria-label="ورقة عمل">
              <FileText className="h-4 w-4 text-orange-500" />
            </Link>
          </Button>

          <Button variant="outline" size="sm" className="h-11 w-11 shrink-0 p-0" asChild>
            <Link to="/ai-quiz" search={aiSearch as never} aria-label="اختبار">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
            </Link>
          </Button>

          <Button variant="outline" size="sm" className="h-11 w-11 shrink-0 p-0" asChild>
            <Link to="/ai-activity-ideas" search={aiSearch as never} aria-label="أفكار إثرائية">
              <Lightbulb className="h-4 w-4 text-amber-500" />
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {canDeletePreparation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 min-h-11 flex-1 min-w-[132px] gap-1.5 text-destructive"
              disabled={busy}
              onClick={() => onResetPreparation(session.id)}
            >
              <Trash2 className="h-4 w-4" />
              <span>{DELETE_PREPARATION_LABEL}</span>
            </Button>
          ) : null}

          {canCancelPreparing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 min-h-11 flex-1 min-w-[132px] gap-1.5"
              disabled={busy}
              onClick={() => onResetPreparation(session.id)}
            >
              <RotateCcw className="h-4 w-4" />
              <span>{CANCEL_PREPARING_LABEL}</span>
            </Button>
          ) : null}

          {canPrepare ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 min-h-11 flex-1 min-w-[132px] gap-1.5"
              disabled={busy}
              onClick={() => onPrepare(session.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>تحضير الدرس</span>
            </Button>
          ) : null}

          {isPreparing ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 min-h-11 flex-1 min-w-[132px] gap-1.5"
              disabled
            >
              <span>جاري التحضير</span>
            </Button>
          ) : null}

          {!isCompleted && !isPreparing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 min-h-11 flex-1 min-w-[132px] gap-1.5"
              disabled={busy}
              onClick={() => onComplete(session.id)}
            >
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <span>إنهاء الحصة</span>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
