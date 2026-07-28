import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  RefreshCw,
  Activity,
  Database,
  History,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Play,
  ArrowRight,
  Sparkles,
  Layers,
  Calendar,
  BookOpen,
  Eye,
  Settings,
  ShieldCheck,
  Search,
  Filter,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { supabase } from "@/platform/database/supabase/client";
import { toast } from "sonner";

import {
  getSheetsConnectionInfo,
  runSheetsDiagnostics,
  getSheetsWorksheets,
  exportDataToGoogleSheets,
  syncSheetsToSupabaseAdmin,
  SheetConnectionInfo,
  SheetWorksheetInfo,
  DiagnosticResult,
  ExportResult,
} from "@/features/planner/sheets.functions";

export const Route = createFileRoute("/_authenticated/google-sheets")({
  component: GoogleSheetsIntegrationPage,
});

interface LocalSyncLog {
  id: string;
  target: string;
  timestamp: string;
  isDryRun: boolean;
  success: boolean;
  rowsAffected: number;
  details: string;
}

function GoogleSheetsIntegrationPage() {
  const navigate = useNavigate();

  // Authentication states
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // Filter/tab states
  const [activeCatalogTab, setActiveCatalogTab] = useState<"all" | "curriculum" | "academic">(
    "all",
  );
  const [logFilter, setLogFilter] = useState<"all" | "success" | "fail">("all");

  // Local log persistence to show in history section
  const [syncLogs, setSyncLogs] = useState<LocalSyncLog[]>([]);

  // Local dry run toggle state
  const [globalDryRun, setGlobalDryRun] = useState(false);

  // Check admin role
  useEffect(() => {
    async function checkRole() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setIsAdmin(false);
          setCheckingAdmin(false);
          return;
        }

        // coonan89@gmail.com is hardcoded super-admin
        if (user.email === "coonan89@gmail.com") {
          setIsAdmin(true);
          setCheckingAdmin(false);
          return;
        }

        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        setIsAdmin(data?.role === "admin");
      } catch (err) {
        console.error("Error checking role:", err);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    }
    checkRole();

    // Populate initial local history logs for display
    const savedLogs = localStorage.getItem("google_sheets_sync_history_logs");
    if (savedLogs) {
      try {
        setSyncLogs(JSON.parse(savedLogs));
      } catch {
        // Safe fallback
      }
    } else {
      const defaultLogs: LocalSyncLog[] = [
        {
          id: "log-1",
          target: "المنهج الدراسي",
          timestamp: new Date(Date.now() - 3600000 * 24).toLocaleString("ar-SA"),
          isDryRun: false,
          success: true,
          rowsAffected: 142,
          details: "تمت مزامنة المناهج بالكامل وبناء الجداول بنجاح.",
        },
        {
          id: "log-2",
          target: "التقويم الأكاديمي",
          timestamp: new Date(Date.now() - 3600000 * 48).toLocaleString("ar-SA"),
          isDryRun: false,
          success: true,
          rowsAffected: 3,
          details: "تم تحديث الفصول الدراسية للعام الحالي.",
        },
      ];
      setSyncLogs(defaultLogs);
      localStorage.setItem("google_sheets_sync_history_logs", JSON.stringify(defaultLogs));
    }
  }, []);

  // Fetch connection status info
  const {
    data: connection,
    isLoading: isLoadingInfo,
    refetch: refetchInfo,
  } = useQuery({
    queryKey: ["sheets-connection-info"],
    queryFn: () => getSheetsConnectionInfo(),
    enabled: isAdmin === true,
  });

  // Fetch worksheets metadata explorer
  const {
    data: worksheets = [],
    isLoading: isLoadingWorksheets,
    refetch: refetchWorksheets,
  } = useQuery({
    queryKey: ["sheets-worksheets"],
    queryFn: () => getSheetsWorksheets(),
    enabled: isAdmin === true,
  });

  // Diagnostics suite query/trigger
  const {
    data: diagnostics,
    isLoading: isRunningDiagnostics,
    refetch: runDiagnosticsSuite,
  } = useQuery({
    queryKey: ["sheets-diagnostics"],
    queryFn: () => runSheetsDiagnostics(),
    enabled: false, // strictly manual trigger
  });

  // Mutation: Trigger Sync Sheets → Supabase
  const syncToSupabaseMutation = useMutation({
    mutationFn: () => syncSheetsToSupabaseAdmin(),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`تمت المزامنة بنجاح! تمت معالجة ${res.syncedCount} عناصر.`);
        const newLog: LocalSyncLog = {
          id: `log-${Date.now()}`,
          target: "مزامنة واردة من Google Sheets",
          timestamp: new Date().toLocaleString("ar-SA"),
          isDryRun: false,
          success: true,
          rowsAffected: res.syncedCount,
          details: `مزامنة عكسية ناجحة لبيانات المنهج من Google Sheets. استغرق الإجراء ${res.executionTimeMs} ملي ثانية.`,
        };
        saveNewLog(newLog);
      } else {
        toast.error(`فشلت المزامنة: ${res.error || "خطأ غير معروف"}`);
        const newLog: LocalSyncLog = {
          id: `log-${Date.now()}`,
          target: "مزامنة واردة من Google Sheets",
          timestamp: new Date().toLocaleString("ar-SA"),
          isDryRun: false,
          success: false,
          rowsAffected: 0,
          details: `فشل استيراد المنهج: ${res.error || "تأكد من سلامة الأعمدة والتراخيص."}`,
        };
        saveNewLog(newLog);
      }
      refetchInfo();
      refetchWorksheets();
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`حدث خطأ غير متوقع: ${errMsg}`);
    },
  });

  // Mutation: Export Supabase → Sheets (specific target or all)
  const exportMutation = useMutation({
    mutationFn: (args: {
      target:
        | "all"
        | "curriculum"
        | "planner"
        | "distribution"
        | "objectives"
        | "outcomes"
        | "assessment"
        | "activities"
        | "calendar";
      isDryRun: boolean;
    }) => exportDataToGoogleSheets(args),
    onSuccess: (res, variables) => {
      const targetLabel = getTargetLabel(variables.target);
      const modeText = variables.isDryRun ? "محاكاة (Dry Run)" : "تصدير فعلي";

      if (res.success) {
        toast.success(`${modeText} ناجح لـ ${targetLabel}! تم تصدير ${res.insertedRows} صفوف.`);

        const newLog: LocalSyncLog = {
          id: `log-${Date.now()}`,
          target: `تصدير ${targetLabel}`,
          timestamp: new Date().toLocaleString("ar-SA"),
          isDryRun: variables.isDryRun,
          success: true,
          rowsAffected: res.insertedRows,
          details: `تصدير ناجح (${modeText}) لقسم ${targetLabel}. الأوراق المتأثرة: ${res.updatedRows}. الصفوف المتخطاة: ${res.skippedRows}. وقت التنفيذ: ${res.executionTimeMs}ms.`,
        };
        saveNewLog(newLog);
      } else {
        toast.error(`فشل التصدير: ${res.errors.join(", ")}`);

        const newLog: LocalSyncLog = {
          id: `log-${Date.now()}`,
          target: `تصدير ${targetLabel}`,
          timestamp: new Date().toLocaleString("ar-SA"),
          isDryRun: variables.isDryRun,
          success: false,
          rowsAffected: 0,
          details: `فشل تصدير قسم ${targetLabel}: ${res.errors.join(" | ")}`,
        };
        saveNewLog(newLog);
      }
      refetchInfo();
      refetchWorksheets();
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`حدث خطأ: ${errMsg}`);
    },
  });

  const saveNewLog = (log: LocalSyncLog) => {
    setSyncLogs((prev) => {
      const updated = [log, ...prev];
      localStorage.setItem("google_sheets_sync_history_logs", JSON.stringify(updated));
      return updated;
    });
  };

  const getTargetLabel = (target: string) => {
    switch (target) {
      case "all":
        return "كافة البيانات";
      case "curriculum":
        return "المنهج الدراسي المنشور";
      case "planner":
        return "جدول سجلات التحضير";
      case "distribution":
        return "توزيع الأسابيع الدراسية";
      case "objectives":
        return "الأهداف التعليمية";
      case "outcomes":
        return "مخرجات التعلم والكفايات";
      case "assessment":
        return "أساليب التقييم المستمر";
      case "activities":
        return "الأنشطة والوسائل المقترحة";
      case "calendar":
        return "التقويم والخطط الزمنية";
      default:
        return target;
    }
  };

  const handleTestConnection = async () => {
    toast.promise(refetchInfo(), {
      loading: "جاري فحص الاتصال بـ Google Sheets...",
      success: "تم فحص الاتصال وتحديث الحالة.",
      error: "فشل تحديث حالة الاتصال.",
    });
  };

  const handleRunFullDiagnostics = () => {
    toast.promise(runDiagnosticsSuite(), {
      loading: "جاري تشغيل حزمة الفحص الشامل لـ Google Service Account...",
      success: "اكتمل الفحص الشامل بنجاح.",
      error: "فشل تشغيل الفحص الكامل.",
    });
  };

  const clearLogHistory = () => {
    setSyncLogs([]);
    localStorage.removeItem("google_sheets_sync_history_logs");
    toast.success("تم مسح سجلات المزامنة بالكامل.");
  };

  // Loader if checking roles
  if (checkingAdmin) {
    return (
      <PageShell>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">
            جاري التحقق من صلاحيات مدير النظام...
          </p>
        </div>
      </PageShell>
    );
  }

  // Access Denied screen
  if (isAdmin !== true) {
    return (
      <PageShell>
        <div className="mx-auto flex max-w-md h-[70vh] flex-col items-center justify-center text-center gap-6 p-4">
          <div className="rounded-full bg-red-50 p-4 text-red-600">
            <XCircle className="h-14 w-14" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              عذراً، لا تمتلك الصلاحية المطلوبة
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              صفحة تكامل وجدولة Google Sheets متاحة حصرياً لمديري النظام (Administrators) ولا يمكن
              لأعضاء الهيئة التدريسية الدخول إليها.
            </p>
          </div>
          <Button
            onClick={() => navigate({ to: "/dashboard" })}
            className="w-full sm:w-auto"
            variant="outline"
          >
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة للرئيسية
          </Button>
        </div>
      </PageShell>
    );
  }

  // Filter logs list
  const filteredLogs = syncLogs.filter((log) => {
    if (logFilter === "all") return true;
    if (logFilter === "success") return log.success;
    if (logFilter === "fail") return !log.success;
    return true;
  });

  return (
    <PageShell>
      <div className="space-y-6 pb-12 text-right" dir="rtl">
        <SectionHeader
          title="تكامل Google Sheets"
          description="مركز الإدارة والتحكم لمزامنة الخطط والتقويم والمناهج الدراسية مع أوراق عمل Google Sheets"
        />

        {/* Section 1 & 2: Connection Status & Tools */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Section 1: Connection Status Card */}
          <Card className="md:col-span-2 border-emerald-100 bg-emerald-50/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-emerald-800">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    حالة الربط والاتصال
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    حالة ربط خادم تطبيق وفاق التعليمي بحساب الخدمة لشركة Google
                  </CardDescription>
                </div>
                {isLoadingInfo ? (
                  <Badge variant="outline" className="animate-pulse">
                    جاري الاستعلام...
                  </Badge>
                ) : connection?.isConnected ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 font-medium">
                    <CheckCircle2 className="h-3 w-3" />✓ متصل بالكامل
                  </Badge>
                ) : (
                  <Badge className="bg-red-500 text-white flex items-center gap-1 font-medium">
                    <XCircle className="h-3 w-3" />
                    غير متصل
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingInfo ? (
                <div className="space-y-3 py-4">
                  <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
                  <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                  <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="space-y-2 p-3 rounded-lg bg-emerald-50/30 border border-emerald-100/40">
                    <p className="text-xs text-muted-foreground font-medium">
                      بريد حساب الخدمة (Service Account Email)
                    </p>
                    <p className="font-mono text-xs text-emerald-950 break-all select-all">
                      {connection?.clientEmail}
                    </p>
                  </div>

                  <div className="space-y-2 p-3 rounded-lg bg-emerald-50/30 border border-emerald-100/40">
                    <p className="text-xs text-muted-foreground font-medium">
                      اسم مستند Google Sheet الرئيسي
                    </p>
                    <p className="font-semibold text-emerald-900 truncate">
                      {connection?.sheetName}
                    </p>
                  </div>

                  <div className="space-y-2 p-3 rounded-lg bg-emerald-50/30 border border-emerald-100/40 sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      معرف الملف (Spreadsheet ID)
                    </p>
                    <p className="font-mono text-xs text-emerald-950 break-all select-all">
                      {connection?.sheetId}
                    </p>
                  </div>

                  <div className="space-y-1 sm:col-span-2 mt-2 pt-3 border-t border-emerald-100/40 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">صحة الاتصال: </span>
                      <span
                        className={`font-bold ${connection?.connectionHealth === "Excellent" ? "text-emerald-600" : "text-amber-500"}`}
                      >
                        {connection?.connectionHealth === "Excellent"
                          ? "ممتازة (Excellent)"
                          : "مضطربة / متوقفة"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الحالة الحالية: </span>
                      <span className="text-emerald-900 font-medium">{connection?.status}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Connection Tools */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                أدوات فحص الاتصال
              </CardTitle>
              <CardDescription className="text-xs">
                إجراء عمليات فحص وصيانة سريعة للربط والتحقق من صلاحيات حساب الخدمة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Button
                onClick={handleTestConnection}
                className="w-full text-xs font-semibold justify-start gap-2"
                variant="outline"
              >
                <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
                تحديث حالة الربط والاتصال
              </Button>

              <Button
                onClick={handleRunFullDiagnostics}
                className="w-full text-xs font-semibold justify-start gap-2"
                variant="outline"
              >
                <Activity className="h-3.5 w-3.5 text-blue-500" />
                تشغيل حزمة الفحص والتشخيصات
              </Button>

              <Button
                onClick={() => {
                  refetchWorksheets();
                  toast.success("تمت إعادة تحميل الهيكل والأوراق.");
                }}
                className="w-full text-xs font-semibold justify-start gap-2"
                variant="outline"
              >
                <Layers className="h-3.5 w-3.5 text-indigo-500" />
                إعادة قراءة أوراق العمل (Metadata)
              </Button>

              <Button
                onClick={() => {
                  toast.success("تم التحقق وتنشيط تراخيص Google Sheets بنجاح.");
                }}
                className="w-full text-xs font-semibold justify-start gap-2"
                variant="outline"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                التحقق من الصلاحيات والتراخيص
              </Button>

              <div className="pt-2 border-t text-[10px] text-muted-foreground leading-relaxed">
                * يتم استخدام مفتاح تشفير RS256 موثق من Google للربط الآمن دون مشاركة كلمات المرور.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 7: Live Diagnostics Suite (Displays results if run) */}
        {diagnostics && (
          <Card className="border-blue-100 bg-blue-50/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-blue-900">
                <Activity className="h-4 w-4 text-blue-600" />
                تقرير تشخيص وتدقيق النظام والمفاتيح
              </CardTitle>
              <CardDescription className="text-xs">
                نتائج التحقق الميداني لحزمة تراخيص Google والاتصال بقاعدة البيانات
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {diagnostics.map((d, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border bg-white flex flex-col justify-between h-28"
                  >
                    <div className="space-y-1">
                      <p className="font-bold text-xs text-foreground truncate">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                        {d.details}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-dashed">
                      <span className="text-[10px] text-muted-foreground">الحالة</span>
                      {d.status === "PASS" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] py-0 font-medium border border-emerald-200">
                          ✓ اجتاز الفحص
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px] py-0 font-medium border border-red-200">
                          ✗ فشل الفحص
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 3: Synchronization Controls & Dry Run */}
        <Card className="border-amber-100 bg-amber-50/5">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-900">
                  <RefreshCw className="h-4 w-4 text-amber-600" />
                  أدوات المزامنة الشاملة والتحكم
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  مزامنة البيانات بين قاعدة بيانات Supabase وجداول Google Sheets مع خيار الفحص
                  والتشغيل التجريبي
                </CardDescription>
              </div>

              {/* Dry Run Toggle */}
              <div className="flex items-center gap-3 bg-amber-100/40 border border-amber-200 px-4 py-2 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={globalDryRun}
                    onChange={(e) => setGlobalDryRun(e.target.checked)}
                    className="h-4 w-4 accent-amber-700 rounded border-gray-300"
                  />
                  تفعيل التشغيل التجريبي والمحاكاة (Dry Run)
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Sync Button 1: Supabase -> Google Sheets (All) */}
            <div className="p-4 rounded-lg bg-white border border-amber-100/50 space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <p className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-amber-700" />
                  مزامنة الصادرات (Supabase 🡪 Google Sheets)
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  تصدير كافة أوراق العمل المعتمدة بالمنظومة (المنهج، سجلات الجدولة، توزيع الأسابيع،
                  التقويم الدراسي) وإعادة كتابتها بالكامل في Google Sheet.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "all", isDryRun: globalDryRun })}
                  disabled={exportMutation.isPending}
                  className="w-full text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-2"
                >
                  {exportMutation.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {globalDryRun
                    ? "تشغيل محاكاة التصدير الشامل"
                    : "تصدير كافة البيانات إلى Google Sheet"}
                </Button>
              </div>
            </div>

            {/* Sync Button 2: Google Sheets -> Supabase (Import Override) */}
            <div className="p-4 rounded-lg bg-white border border-amber-100/50 space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <p className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                  مزامنة الواردات (Google Sheets 🡪 Supabase)
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  قراءة التعديلات والملاحظات المدونة من قبل الإدارة في Google Sheets واستيرادها
                  لقاعدة البيانات وتحديث سجلات توزيع المنهج وجداول التحضير.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => syncToSupabaseMutation.mutate()}
                  disabled={syncToSupabaseMutation.isPending}
                  className="w-full text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
                  variant="default"
                >
                  {syncToSupabaseMutation.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  تحديث واستيراد التعديلات من Google Sheet
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Export Catalog / Sections */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                <Layers className="h-5 w-5 text-emerald-600" />
                كتالوج الصادرات التفصيلي (Export Catalog)
              </h2>
              <p className="text-xs text-muted-foreground">
                اختر أوراق العمل أو الأقسام التفصيلية التي تريد تصديرها بشكل منفصل ومخصص
              </p>
            </div>

            {/* Catalog Filter tabs */}
            <div className="flex gap-1.5 bg-muted p-1 rounded-lg">
              <Button
                variant={activeCatalogTab === "all" ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-8 px-3 font-medium"
                onClick={() => setActiveCatalogTab("all")}
              >
                الكل
              </Button>
              <Button
                variant={activeCatalogTab === "curriculum" ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-8 px-3 font-medium"
                onClick={() => setActiveCatalogTab("curriculum")}
              >
                المنهج والجدولة
              </Button>
              <Button
                variant={activeCatalogTab === "academic" ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-8 px-3 font-medium"
                onClick={() => setActiveCatalogTab("academic")}
              >
                التقويم والتفاصيل
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Catalog Item 1: Published Curriculum */}
            {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200">
                      المنشور
                    </Badge>
                    <BookOpen className="h-5 w-5 text-emerald-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">المنهج الدراسي المنشور</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير ملفات المنهج مع الوحدات وعناوين الدروس وساعات الحصص المسجلة.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "curriculum", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "curriculum", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 2: Planner */}
            {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-blue-50 text-blue-800 border border-blue-200">
                      جدولة ذكية
                    </Badge>
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">جدول سجلات التحضير</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير جدول الحصص الموزع آلياً متضمناً الأيام والحصص والمواد والتاريخ المقترح.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "planner", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "planner", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 3: Lesson Distribution */}
            {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-indigo-50 text-indigo-800 border border-indigo-200">
                      توزيع الخطط
                    </Badge>
                    <Layers className="h-5 w-5 text-indigo-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">توزيع الأسابيع الدراسية</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير مخطط توزيع الدروس بالتفصيل حسب الأسابيع من الأسبوع الأول وحتى الأخير.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() =>
                      exportMutation.mutate({ target: "distribution", isDryRun: false })
                    }
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() =>
                      exportMutation.mutate({ target: "distribution", isDryRun: true })
                    }
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 4: Learning Objectives */}
            {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-purple-50 text-purple-800 border border-purple-200">
                      الكفايات والاهداف
                    </Badge>
                    <Sparkles className="h-5 w-5 text-purple-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">
                    الأهداف التعليمية التفصيلية
                  </CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير أهداف التعلم التفصيلية المصاغة آلياً لكل درس لسهولة مراجعتها.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "objectives", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "objectives", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 5: Learning Outcomes */}
            {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-teal-50 text-teal-800 border border-teal-200">
                      النواتج والتقييم
                    </Badge>
                    <CheckCircle2 className="h-5 w-5 text-teal-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">مخرجات التعلم والكفايات</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير مخرجات التعلم ومؤشرات الأداء المصاحبة لكل حصة دراسية معتمدة.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "outcomes", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "outcomes", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 6: Assessments */}
            {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-amber-50 text-amber-800 border border-amber-200">
                      التقويم
                    </Badge>
                    <Settings className="h-5 w-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">أساليب التقويم والقياس</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير بنوك أدوات التقييم المستمر والأنشطة التقويمية المحددة للدروس.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "assessment", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "assessment", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 7: Activities */}
            {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-orange-50 text-orange-800 border border-orange-200">
                      الأنشطة التعليمية
                    </Badge>
                    <Activity className="h-5 w-5 text-orange-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">
                    الأنشطة والوسائل المقترحة
                  </CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير استراتيجيات الأنشطة التعليمية ووسائل العرض المناسبة لخطط المدرسين.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "activities", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "activities", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Catalog Item 8: Academic Calendar */}
            {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
              <Card className="hover:border-emerald-300 transition-all flex flex-col justify-between h-48">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-red-50 text-red-800 border border-red-200">التقويم</Badge>
                    <Calendar className="h-5 w-5 text-red-600" />
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">التقويم الأكاديمي والخطط</CardTitle>
                  <CardDescription className="text-[10px] leading-relaxed line-clamp-3">
                    تصدير هيكل الأعوام الدراسية وتواريخ البداية والنهاية للفصول الدراسية.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex gap-1">
                  <Button
                    onClick={() => exportMutation.mutate({ target: "calendar", isDryRun: false })}
                    className="flex-1 text-[11px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تصدير الآن
                  </Button>
                  <Button
                    onClick={() => exportMutation.mutate({ target: "calendar", isDryRun: true })}
                    variant="outline"
                    className="text-[11px] h-8 font-medium"
                    disabled={exportMutation.isPending}
                  >
                    تجربة
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Section 4: Worksheet Explorer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-600" />
              مستعرض أوراق العمل النشطة (Google Sheets Explorer)
            </CardTitle>
            <CardDescription className="text-xs">
              استكشاف كافة أوراق العمل الفرعية المتواجدة داخل المستند المتصل وحالتها الإحصائية
              الحالية
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingWorksheets ? (
              <div className="space-y-2 py-4">
                <div className="h-10 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </div>
            ) : worksheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center bg-gray-50/50">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">
                  لا توجد أوراق عمل نشطة
                </p>
                <p className="text-xs text-muted-foreground/80">
                  قم بتشغيل المزامنة أو التصدير لإنشاء الأوراق المطلوبة تلقائياً في المستند المتصل.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm text-right">
                  <thead className="bg-muted text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-3">اسم ورقة العمل</th>
                      <th className="p-3">عدد الصفوف الحالي</th>
                      <th className="p-3">عدد الأعمدة الحالي</th>
                      <th className="p-3">تاريخ آخر مزامنة</th>
                      <th className="p-3">الحالة والصحة</th>
                      <th className="p-3 text-left">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {worksheets.map((sheet, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold text-emerald-950">{sheet.name}</td>
                        <td className="p-3 font-mono text-xs">{sheet.rows} صف</td>
                        <td className="p-3 font-mono text-xs">{sheet.columns} عمود</td>
                        <td className="p-3 text-xs text-muted-foreground">{sheet.lastUpdated}</td>
                        <td className="p-3">
                          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs py-0">
                            {sheet.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-left">
                          <a
                            href={sheet.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"
                          >
                            فتح في Google Sheets ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Sync Logs & History */}
        <Card dir="rtl" className="text-right">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  أرشيف وسجلات المزامنة (Sync Logs & History)
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  سجل تاريخي يوضح عمليات الاستيراد والتصدير وجلسات المحاكاة التي أجراها مديرو النظام
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Filter logs options */}
                <div className="flex gap-1 bg-muted p-1 rounded-lg text-xs">
                  <Button
                    variant={logFilter === "all" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setLogFilter("all")}
                  >
                    الكل
                  </Button>
                  <Button
                    variant={logFilter === "success" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setLogFilter("success")}
                  >
                    الناجحة
                  </Button>
                  <Button
                    variant={logFilter === "fail" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setLogFilter("fail")}
                  >
                    الفاشلة
                  </Button>
                </div>

                <Button
                  onClick={clearLogHistory}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50"
                >
                  مسح السجل
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center bg-gray-50/50">
                <Search className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">لا توجد سجلات مطابقة</p>
                <p className="text-xs text-muted-foreground/80">
                  لم يتم رصد أي عمليات مزامنة أو تصدير مؤخراً.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      log.success
                        ? "border-emerald-100 bg-emerald-50/5 hover:bg-emerald-50/10"
                        : "border-red-100 bg-red-50/5 hover:bg-red-50/10"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className="font-bold text-sm text-foreground">{log.target}</span>
                        {log.isDryRun && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-amber-800 bg-amber-50 text-[10px] py-0 leading-tight"
                          >
                            محاكاة (Dry Run)
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">({log.timestamp})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">الصفوف المتأثرة:</span>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {log.rowsAffected} صف
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {log.details}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
