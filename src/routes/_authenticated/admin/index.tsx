import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  Banknote,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SectionHeader } from "@/shared/components/section-header";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  getAdminDashboardStats,
  type AdminDashboardStats,
} from "@/platform/auth/admin-access.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboardPage,
});

type MetricCard = {
  key: keyof Pick<
    AdminDashboardStats,
    | "users"
    | "teachers"
    | "admins"
    | "curriculumTotal"
    | "curriculumDraft"
    | "curriculumPublished"
    | "curriculumArchived"
  >;
  label: string;
  icon: LucideIcon;
  tone: string;
};

const METRICS: MetricCard[] = [
  { key: "users", label: "عدد المستخدمين", icon: Users, tone: "text-teal-700 bg-teal-50" },
  { key: "teachers", label: "عدد المعلمين", icon: UserCog, tone: "text-sky-700 bg-sky-50" },
  { key: "admins", label: "عدد المدراء", icon: ShieldCheck, tone: "text-amber-700 bg-amber-50" },
  {
    key: "curriculumTotal",
    label: "إجمالي ملفات المناهج",
    icon: BookOpen,
    tone: "text-violet-700 bg-violet-50",
  },
  {
    key: "curriculumPublished",
    label: "مناهج منشورة",
    icon: FileText,
    tone: "text-emerald-700 bg-emerald-50",
  },
  {
    key: "curriculumDraft",
    label: "مسودات المناهج",
    icon: FileText,
    tone: "text-orange-700 bg-orange-50",
  },
  {
    key: "curriculumArchived",
    label: "مناهج مؤرشفة",
    icon: Archive,
    tone: "text-zinc-700 bg-zinc-100",
  },
];

function statusLabel(status: string): string {
  switch (status) {
    case "published":
      return "منشور";
    case "draft":
      return "مسودة";
    case "archived":
      return "مؤرشف";
    default:
      return status;
  }
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AdminDashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: () => getAdminDashboardStats(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="لوحة تحكم الإدارة"
        description="نظرة عامة على المستخدمين وملفات المناهج الرسمية في ورقة."
        action={
          <Button
            variant="outline"
            className="h-11 min-h-[44px]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            تحديث
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">جاري تحميل بيانات لوحة الإدارة…</p>
        </div>
      ) : null}

      {isError ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg">تعذّر تحميل البيانات</CardTitle>
            <CardDescription>
              لم نتمكن من جلب مؤشرات لوحة الإدارة. تأكد من صلاحياتك كمدير نظام ثم أعد المحاولة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="h-11 min-h-[44px]" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.key} className="shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div
                      className={`grid h-11 w-11 place-items-center rounded-xl ${metric.tone}`}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{metric.label}</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">
                        {data[metric.key].toLocaleString("ar-SA")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">النشاط الأخير للمناهج</CardTitle>
                <CardDescription>آخر التحديثات على ملفات المناهج حسب وقت التعديل.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentCurriculum.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    لا توجد ملفات مناهج بعد.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.recentCurriculum.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.subject, item.grade].filter(Boolean).join(" · ") || "بدون تصنيف"}
                            {" · "}
                            {formatUpdatedAt(item.updatedAt)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="w-fit shrink-0">
                          {statusLabel(item.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">اختصارات الإدارة</CardTitle>
                <CardDescription>
                  الانتقال إلى الوحدات الإدارية الحالية دون تكرار منطق الأعمال.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button asChild className="h-11 min-h-[44px] justify-start gap-2">
                  <Link to="/admin/users">
                    <Users className="h-4 w-4" />
                    إدارة المستخدمين
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                  <Link to="/admin/payments">
                    <Banknote className="h-4 w-4" />
                    مراجعة الدفعات
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                  <Link to="/admin/curriculum-management">
                    <BookOpen className="h-4 w-4" />
                    إدارة المناهج
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                  <Link to="/admin/academic-calendar">
                    <CalendarDays className="h-4 w-4" />
                    التقويم الدراسي
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                  <Link to="/admin/google-sheets">
                    <FileSpreadsheet className="h-4 w-4" />
                    تكامل Google Sheets
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
