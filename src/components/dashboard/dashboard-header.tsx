import { Link } from "@tanstack/react-router";
import { CalendarDays, School, User } from "lucide-react";

import { SubscriptionBadge } from "@/features/billing/components/subscription-badge";
import type { SubscriptionDisplayInput } from "@/features/billing/components/subscription-badge";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

interface DashboardHeaderProps {
  teacherName: string;
  hijriDate: string;
  /** True only when a real Madrasati browser sync connection exists. */
  connected: boolean;
  subscriptionDisplay: SubscriptionDisplayInput;
}

export function DashboardHeader({
  teacherName,
  hijriDate,
  connected,
  subscriptionDisplay,
}: DashboardHeaderProps) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <User className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary">أهلاً بك</p>

            <h1 className="text-2xl font-bold">{teacherName}</h1>

            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {hijriDate}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={connected ? "default" : "outline"}>
                <School className="mr-1 h-4 w-4" />
                {connected ? "مدرستي مرتبطة" : "مزامنة مدرستي غير متاحة حالياً"}
              </Badge>

              <Link
                to="/subscription"
                aria-label="عرض تفاصيل الاشتراك والفوترة"
                className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <SubscriptionBadge {...subscriptionDisplay} />
              </Link>

              {!connected && (
                <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                  <Link to="/connect-school">تفاصيل مزامنة مدرستي</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
