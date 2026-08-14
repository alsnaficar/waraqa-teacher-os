import { Link } from "@tanstack/react-router";
import { BookOpen, FileText, FlaskConical } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export interface TodayLessonCardProps {
  entry: {
    id: string;
    period: number;
    grade?: string;
    className?: string;
    klass?: string;
    lessonTitle: string;
    subject: string;
    /** When set, AI deep links are session-bound (P3 Step 2). */
    lessonSessionId?: string;
  };
}

export function TodayLessonCard({ entry }: TodayLessonCardProps) {
  const displayGrade = entry.className || entry.grade || "";
  const shortGrade = displayGrade.replace(/^الصف\s+/, "");
  const displayKlass = entry.klass || "";

  const hasSession = Boolean(entry.lessonSessionId);
  const searchParams = hasSession
    ? {
        lessonSessionId: entry.lessonSessionId!,
        stage: displayGrade.includes("متوسط")
          ? ("intermediate" as const)
          : displayGrade.includes("ثانوي")
            ? ("secondary" as const)
            : ("primary" as const),
        grade: displayGrade,
        subject: entry.subject,
        title: entry.lessonTitle,
      }
    : null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <span className="text-sm font-bold">{entry.period}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {shortGrade || "مادة مخصصة"}
            </Badge>

            {displayKlass && (
              <span className="text-[10px] text-muted-foreground">{displayKlass}</span>
            )}
          </div>

          <p className="mt-1 truncate text-sm font-semibold">{entry.lessonTitle}</p>
        </div>

        <div className="flex items-center gap-1">
          {searchParams ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-lesson-plan" search={searchParams as never}>
                  <BookOpen className="h-4 w-4 text-emerald-600" />
                </Link>
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-worksheet" search={searchParams as never}>
                  <FileText className="h-4 w-4 text-orange-500" />
                </Link>
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-quiz" search={searchParams as never}>
                  <FlaskConical className="h-4 w-4 text-indigo-600" />
                </Link>
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link to="/lesson-sessions">فتح الحصة</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
