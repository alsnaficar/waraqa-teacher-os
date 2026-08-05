import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import {
  BookOpen,
  FileText,
  ClipboardCheck,
  Lightbulb,
} from "lucide-react";

export function QuickActions() {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-4 font-bold text-lg">الإجراءات السريعة</h2>

        <div className="grid grid-cols-2 gap-3">

          <Button asChild className="h-14">
            <Link to="/ai-lesson-plan">
              <BookOpen className="ml-2 h-5 w-5" />
              حضّر حصة اليوم
            </Link>
          </Button>

          <Button asChild variant="secondary" className="h-14">
           <Link to="/ai-worksheet">
              <FileText className="ml-2 h-5 w-5" />
              ورقة عمل
            </Link>
          </Button>

          <Button asChild variant="secondary" className="h-14">
            <Link to="/ai-quiz">
              <ClipboardCheck className="ml-2 h-5 w-5" />
              اختبار سريع
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-14">
            <Link to="/ai-activity-ideas">
              <Lightbulb className="ml-2 h-5 w-5" />
              نشاط صفي
            </Link>
          </Button>

        </div>
      </CardContent>
    </Card>
  );
}

