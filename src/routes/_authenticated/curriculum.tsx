import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { FileSpreadsheet, FileText, Upload, Settings } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getTermsLabelMap } from "@/lib/academic-config";

export const Route = createFileRoute("/_authenticated/curriculum")({
  component: CurriculumPage,
});

function CurriculumPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      if (user.email === "coonan89@gmail.com") {
        setIsAdmin(true);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.role === "admin") {
        setIsAdmin(true);
      }
    }
    checkRole();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["curriculum-files"],
    queryFn: async () => {
      const { data: files } = await supabase
        .from("curriculum_files")
        .select(
          "id, original_name, subject, grade, semester, academic_year, mime_type, size_bytes, created_at",
        )
        .eq("status", "published") // Teachers only see officially published curriculum
        .order("created_at", { ascending: false });
      return files ?? [];
    },
  });

  return (
    <PageShell>
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
        id="curriculum-header"
      >
        <SectionHeader title="المناهج" description="ملفات توزيع المناهج ودروسها الرسمية." />
        {isAdmin && (
          <Button asChild className="h-11 px-5 font-semibold gap-2">
            <Link to="/curriculum-management">
              <Settings className="h-5 w-5" />
              إدارة المناهج (مدير)
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-muted/40" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="لا توجد مناهج بعد"
          description="ابدأ برفع ملف توزيع المنهج (Excel أو PDF) لعرض دروسك هنا."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((f) => {
            const isXlsx =
              f.mime_type?.includes("sheet") || f.original_name.toLowerCase().endsWith(".xlsx");
            const termLabels = getTermsLabelMap();
            const semesterLabel = f.semester ? termLabels[f.semester] || f.semester : null;
            return (
              <Card key={f.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      {isXlsx ? (
                        <FileSpreadsheet className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.original_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[f.subject, f.grade, semesterLabel].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {f.academic_year ? (
                        <Badge variant="secondary" className="mt-2 text-xs">
                          {f.academic_year}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
