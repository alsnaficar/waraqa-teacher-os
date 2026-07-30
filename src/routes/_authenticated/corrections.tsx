import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, ClipboardList, FlaskConical } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";

export const Route = createFileRoute("/_authenticated/corrections")({
  component: CorrectionsPage,
  head: () => ({
    meta: [
      { title: "تصحيح الواجبات والاختبارات | ورقة" },
      {
        name: "description",
        content: "مركز تصحيح الواجبات والاختبارات في منصة ورقة.",
      },
    ],
  }),
});

function CorrectionsPage() {
  return (
    <PageShell>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">تصحيح الواجبات والاختبارات</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                مكان واحد لمراجعة وتصحيح أعمال الطلاب.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard
          icon={ClipboardList}
          title="الواجبات"
          desc="واجبات مُرسلة من الطلاب بانتظار التصحيح."
        />
        <SectionCard
          icon={FlaskConical}
          title="الاختبارات"
          desc="اختبارات مُنجزة بانتظار التصحيح والتقييم."
        />
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <Badge variant="secondary">قريباً</Badge>
          <p className="text-sm text-muted-foreground">
            سيتم ربط هذه الشاشة بأعمال الطلاب بعد تفعيل تكامل النظام المدرسي.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function SectionCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof ClipboardList;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

