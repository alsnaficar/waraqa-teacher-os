import { CalendarDays, School, User } from "lucide-react";

import { SubscriptionBadge } from "@/features/billing/components/subscription-badge";
import type { SubscriptionAccess } from "@/features/billing/types";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

interface DashboardHeaderProps {
  teacherName: string;
  hijriDate: string;
  connected: boolean;
  subscription: SubscriptionAccess;
  subscriptionDaysRemaining?: number | null;
}

export function DashboardHeader({
  teacherName,
  hijriDate,
  connected,
  subscription,
  subscriptionDaysRemaining = null,
}: DashboardHeaderProps) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <User className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <p className="text-xs text-primary">أهلاً بك</p>

            <h1 className="text-2xl font-bold">{teacherName}</h1>

            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {hijriDate}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={connected ? "default" : "outline"}>
                <School className="mr-1 h-4 w-4" />
                {connected ? "مدرستي مرتبطة" : "مدرستي غير مرتبطة"}
              </Badge>

              <SubscriptionBadge access={subscription} daysRemaining={subscriptionDaysRemaining} />

              {!connected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open("/connect-school", "_blank")}
                >
                  ربط المدرسة
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
