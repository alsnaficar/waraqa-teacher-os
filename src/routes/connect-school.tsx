import { createFileRoute } from "@tanstack/react-router";
import { School, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

export const Route = createFileRoute("/connect-school")({
  component: ConnectSchoolPage,
});

function ConnectSchoolPage() {
  return (
    <div className="container mx-auto max-w-3xl p-6">
      <Card>
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center gap-3">
            <School className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">ربط منصة مدرستي</h1>
              <p className="text-muted-foreground">
                قم بتسجيل الدخول إلى منصة مدرستي لبدء عملية الربط.
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <p className="font-medium">حالة الربط</p>

            <p className="mt-2 text-amber-600">⚠️ لا يوجد حساب مرتبط حالياً.</p>
          </div>

          <Button
            className="w-full"
            onClick={() => window.open("https://schools.madrasati.sa", "_blank")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            فتح منصة مدرستي
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
