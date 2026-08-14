import { createFileRoute, Link } from "@tanstack/react-router";
import { School, Info } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE } from "@/platform/integration/connectors/madrasati/madrasati-status";

export const Route = createFileRoute("/connect-school")({
  component: ConnectSchoolPage,
});

function ConnectSchoolPage() {
  return (
    <div className="container mx-auto max-w-3xl p-4 sm:p-6">
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <School className="h-8 w-8 text-primary shrink-0" />
            <div>
              <h1 className="text-2xl font-bold">مزامنة منصة مدرستي</h1>
              <p className="text-muted-foreground mt-1">
                ربط ورقاء بمنصة مدرستي سيتم لاحقاً عبر مزامنة متصفح آمنة من الخادم.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:bg-amber-950/20 dark:border-amber-900/40">
            <p className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0" />
              حالة الربط
            </p>
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-300 font-medium">
              {MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE}
            </p>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              لا نطلب اسم مستخدم أو كلمة مرور مدرستي داخل ورقاء. المنصة حالياً غير جاهزة للمزامنة
              (تحديثات الوزارة / فترة الإجازة)، ولن يتم استيراد جدول حتى تتوفر المزامنة الحقيقية.
            </p>
          </div>

          <Button asChild variant="outline" className="w-full h-11 font-bold">
            <Link to="/settings">العودة إلى الإعدادات</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
