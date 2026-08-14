import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { BookOpen, FileText, ClipboardCheck, Lightbulb, CalendarRange } from "lucide-react";

/**
 * Unscoped AI hub shortcuts must not invent a lessonSessionId.
 * Preparation tools are gated behind /lesson-sessions (P3 Step 2).
 */
export function QuickActions() {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-4 font-bold text-lg">الإجراءات السريعة</h2>

        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="secondary" className="col-span-2 h-14">
            <Link to="/lesson-sessions">
              <CalendarRange className="ml-2 h-5 w-5" />
              حصص اليوم
            </Link>
          </Button>

          <Button asChild className="h-14">
            <Link to="/lesson-sessions">
              <BookOpen className="ml-2 h-5 w-5" />
              حضّر حصة اليوم
            </Link>
          </Button>

          <Button asChild variant="secondary" className="h-14">
            <Link to="/lesson-sessions">
              <FileText className="ml-2 h-5 w-5" />
              ورقة عمل
            </Link>
          </Button>

          <Button asChild variant="secondary" className="h-14">
            <Link to="/lesson-sessions">
              <ClipboardCheck className="ml-2 h-5 w-5" />
              اختبار سريع
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-14">
            <Link to="/lesson-sessions">
              <Lightbulb className="ml-2 h-5 w-5" />
              نشاط صفي
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          اختر حصة من حصص اليوم لفتح أدوات التحضير والذكاء الاصطناعي المرتبطة بها.
        </p>
      </CardContent>
    </Card>
  );
}
