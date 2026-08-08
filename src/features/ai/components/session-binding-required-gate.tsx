import { Link } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

/**
 * Shown when a preparation/AI product route is opened without lessonSessionId.
 * Does not invent a session — teacher must pick a real lesson session.
 */
export function SessionBindingRequiredGate({ toolLabel }: { toolLabel: string }) {
  return (
    <PageShell>
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarRange className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">يلزم اختيار حصة درس</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أداة «{toolLabel}» مرتبطة بحصة درس (Lesson Session). افتح الحصة من شاشة حصص اليوم ثم
            اختر الأداة — لا يمكن التوليد بدون{" "}
            <span className="font-medium text-foreground">lessonSessionId</span>.
          </p>
          <Button asChild className="h-11 w-full">
            <Link to="/lesson-sessions">الانتقال إلى حصص اليوم</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
