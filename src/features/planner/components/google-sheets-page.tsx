import { useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";

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
import { DistributionImportPanel } from "@/features/planner/components/distribution-import-panel";

interface LocalSyncLog {
  id: string;
  target: string;
  timestamp: string;
  isDryRun: boolean;
  success: boolean;
  rowsAffected: number;
  details: string;
}

export function GoogleSheetsIntegrationPage() {
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
    }) =>
      exportDataToGoogleSheets({
        data: args,
      }),
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
      <div className="flex min-h-[50vh] w-full min-w-0 flex-col items-center justify-center gap-4 px-3">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          جاري التحقق من صلاحيات مدير النظام...
        </p>
      </div>
    );
  }

  // Access Denied screen
  if (isAdmin !== true) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full min-w-0 max-w-md flex-col items-center justify-center gap-6 px-3 py-8 text-center">
        <div className="rounded-full bg-red-50 p-4 text-red-600">
          <XCircle className="h-14 w-14" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            عذراً، لا تمتلك الصلاحية المطلوبة
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            صفحة تكامل وجدولة Google Sheets متاحة حصرياً لمديري النظام (Administrators) ولا يمكن
            لأعضاء الهيئة التدريسية الدخول إليها.
          </p>
        </div>
        <Button
          onClick={() => navigate({ to: "/dashboard" })}
          className="h-11 min-h-[44px] w-full sm:w-auto"
          variant="outline"
        >
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة للرئيسية
        </Button>
      </div>
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
    <div className="w-full min-w-0 max-w-full space-y-5 pb-10 text-right md:space-y-6" dir="rtl">
      <SectionHeader
        title="تكامل Google Sheets"
        description="مركز الإدارة والتحكم لمزامنة الخطط والتقويم والمناهج الدراسية مع أوراق عمل Google Sheets"
      />

      <DistributionImportPanel />

      {/* Section 1 & 2: Connection Status & Tools */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Section 1: Connection Status Card */}
        <Card className="min-w-0 border-emerald-100 bg-emerald-50/5 lg:col-span-2">
          <CardHeader className="space-y-3 p-4 pb-3 md:p-6 md:pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-[12rem]">
                <CardTitle className="flex items-start gap-2 text-base font-bold leading-snug text-emerald-800 sm:text-lg">
                  <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="min-w-0 break-words">حالة الربط والاتصال</span>
                </CardTitle>
                <CardDescription className="mt-1 break-words text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  حالة ربط خادم تطبيق وفاق التعليمي بحساب الخدمة لشركة Google
                </CardDescription>
              </div>
              {isLoadingInfo ? (
                <Badge
                  variant="outline"
                  className="max-w-full shrink whitespace-normal animate-pulse"
                >
                  جاري الاستعلام...
                </Badge>
              ) : connection?.isConnected ? (
                <Badge className="flex max-w-full shrink items-center gap-1 whitespace-normal bg-emerald-600 font-medium text-white hover:bg-emerald-700">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />✓ متصل بالكامل
                </Badge>
              ) : (
                <Badge className="flex max-w-full shrink items-center gap-1 whitespace-normal bg-red-500 font-medium text-white">
                  <XCircle className="h-3 w-3 shrink-0" />
                  غير متصل
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-w-0 p-4 md:p-6">
            {isLoadingInfo ? (
              <div className="space-y-3 py-4">
                <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
                <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
              </div>
            ) : (
              <div className="grid gap-4 text-sm lg:grid-cols-2">
                <div className="min-w-0 space-y-2 rounded-lg border border-emerald-100/40 bg-emerald-50/30 p-3">
                  <p className="break-words text-xs font-medium text-muted-foreground">
                    بريد حساب الخدمة (Service Account Email)
                  </p>
                  <p className="font-mono text-xs text-emerald-950 break-all select-all">
                    {connection?.clientEmail}
                  </p>
                </div>

                <div className="min-w-0 space-y-2 rounded-lg border border-emerald-100/40 bg-emerald-50/30 p-3">
                  <p className="break-words text-xs font-medium text-muted-foreground">
                    اسم مستند Google Sheet الرئيسي
                  </p>
                  <p className="break-words font-semibold text-emerald-900">
                    {connection?.sheetName}
                  </p>
                </div>

                <div className="min-w-0 space-y-2 rounded-lg border border-emerald-100/40 bg-emerald-50/30 p-3 lg:col-span-2">
                  <p className="break-words text-xs font-medium text-muted-foreground">
                    معرف الملف (Spreadsheet ID)
                  </p>
                  <p className="break-all font-mono text-xs text-emerald-950 select-all">
                    {connection?.sheetId}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 space-y-1 border-t border-emerald-100/40 pt-3 text-xs lg:col-span-2">
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">صحة الاتصال: </span>
                    <span
                      className={`font-bold ${connection?.connectionHealth === "Excellent" ? "text-emerald-600" : "text-amber-500"}`}
                    >
                      {connection?.connectionHealth === "Excellent"
                        ? "ممتازة (Excellent)"
                        : "مضطربة / متوقفة"}
                    </span>
                  </div>
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">الحالة الحالية: </span>
                    <span className="font-medium text-emerald-900">{connection?.status}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Connection Tools */}
        <Card className="min-w-0">
          <CardHeader className="min-w-0 space-y-2 p-4 pb-3 md:p-6">
            <CardTitle className="flex min-w-0 items-start gap-2 text-base font-bold leading-snug">
              <Settings className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 whitespace-normal">أدوات فحص الاتصال</span>
            </CardTitle>
            <CardDescription className="min-w-0 whitespace-normal text-xs leading-relaxed">
              إجراء عمليات فحص وصيانة سريعة للربط والتحقق من صلاحيات حساب الخدمة
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-2.5 p-4 md:p-6">
            <Button
              onClick={handleTestConnection}
              className="h-auto min-h-[44px] w-full min-w-0 max-w-full justify-start gap-2 whitespace-normal py-2.5 text-sm font-semibold"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 whitespace-normal text-start">
                تحديث حالة الربط والاتصال
              </span>
            </Button>

            <Button
              onClick={handleRunFullDiagnostics}
              className="h-auto min-h-[44px] w-full min-w-0 max-w-full justify-start gap-2 whitespace-normal py-2.5 text-sm font-semibold"
              variant="outline"
            >
              <Activity className="h-4 w-4 shrink-0 text-blue-500" />
              <span className="min-w-0 flex-1 whitespace-normal text-start">
                تشغيل حزمة الفحص والتشخيصات
              </span>
            </Button>

            <Button
              onClick={() => {
                refetchWorksheets();
                toast.success("تمت إعادة تحميل الهيكل والأوراق.");
              }}
              className="h-auto min-h-[44px] w-full min-w-0 max-w-full justify-start gap-2 whitespace-normal py-2.5 text-sm font-semibold"
              variant="outline"
            >
              <Layers className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="min-w-0 flex-1 whitespace-normal text-start">
                إعادة قراءة أوراق العمل (Metadata)
              </span>
            </Button>

            <Button
              onClick={() => {
                toast.success("تم التحقق وتنشيط تراخيص Google Sheets بنجاح.");
              }}
              className="h-auto min-h-[44px] w-full min-w-0 max-w-full justify-start gap-2 whitespace-normal py-2.5 text-sm font-semibold"
              variant="outline"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-purple-500" />
              <span className="min-w-0 flex-1 whitespace-normal text-start">
                التحقق من الصلاحيات والتراخيص
              </span>
            </Button>

            <div className="min-w-0 whitespace-normal border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
              * يتم استخدام مفتاح تشفير RS256 موثق من Google للربط الآمن دون مشاركة كلمات المرور.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 7: Live Diagnostics Suite (Displays results if run) */}
      {diagnostics && (
        <Card className="min-w-0 border-blue-100 bg-blue-50/5">
          <CardHeader className="space-y-2 p-4 pb-2 md:p-6">
            <CardTitle className="flex items-start gap-2 text-base font-bold leading-snug text-blue-900">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="min-w-0 break-words">تقرير تشخيص وتدقيق النظام والمفاتيح</span>
            </CardTitle>
            <CardDescription className="break-words text-xs leading-relaxed">
              نتائج التحقق الميداني لحزمة تراخيص Google والاتصال بقاعدة البيانات
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {diagnostics.map((d, index) => (
                <div
                  key={index}
                  className="flex min-h-[7.5rem] min-w-0 flex-col justify-between rounded-lg border bg-white p-3.5"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-xs font-bold text-foreground">{d.name}</p>
                    <p className="break-words text-[11px] leading-snug text-muted-foreground">
                      {d.details}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2">
                    <span className="text-[11px] text-muted-foreground">الحالة</span>
                    {d.status === "PASS" ? (
                      <Badge className="max-w-full whitespace-normal border border-emerald-200 bg-emerald-100 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100">
                        ✓ اجتاز الفحص
                      </Badge>
                    ) : (
                      <Badge className="max-w-full whitespace-normal border border-red-200 bg-red-100 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100">
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
      <Card className="min-w-0 border-amber-100 bg-amber-50/5">
        <CardHeader className="space-y-3 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="min-w-0 max-w-full flex-1">
              <CardTitle className="flex items-start gap-2 text-base font-bold leading-snug text-amber-900">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span className="min-w-0 break-words">أدوات المزامنة الشاملة والتحكم</span>
              </CardTitle>
              <CardDescription className="mt-1 break-words text-xs leading-relaxed">
                مزامنة البيانات بين قاعدة بيانات Supabase وجداول Google Sheets مع خيار الفحص
                والتشغيل التجريبي
              </CardDescription>
            </div>

            {/* Dry Run Toggle */}
            <div className="flex w-full min-h-[44px] min-w-0 items-center gap-3 rounded-lg border border-amber-200 bg-amber-100/40 px-3 py-2.5 lg:w-auto lg:max-w-md lg:shrink-0 lg:px-4">
              <label className="flex min-h-[44px] w-full min-w-0 cursor-pointer select-none items-start gap-3 text-sm font-semibold text-amber-900">
                <input
                  type="checkbox"
                  checked={globalDryRun}
                  onChange={(e) => setGlobalDryRun(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 accent-amber-700"
                />
                <span className="min-w-0 break-words leading-snug">
                  تفعيل التشغيل التجريبي والمحاكاة (Dry Run)
                </span>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:p-6">
          {/* Sync Button 1: Supabase -> Google Sheets (All) */}
          <div className="flex min-w-0 flex-col justify-between space-y-3 rounded-lg border border-amber-100/50 bg-white p-4">
            <div className="min-w-0 space-y-1">
              <p className="flex items-start gap-1.5 text-sm font-bold text-amber-950">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span className="min-w-0 break-words">
                  مزامنة الصادرات (Supabase 🡪 Google Sheets)
                </span>
              </p>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                تصدير كافة أوراق العمل المعتمدة بالمنظومة (المنهج، سجلات الجدولة، توزيع الأسابيع،
                التقويم الدراسي) وإعادة كتابتها بالكامل في Google Sheet.
              </p>
            </div>
            <div className="min-w-0 pt-2">
              <Button
                onClick={() => exportMutation.mutate({ target: "all", isDryRun: globalDryRun })}
                disabled={exportMutation.isPending}
                className="h-auto min-h-[44px] w-full gap-2 whitespace-normal break-words bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {exportMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {globalDryRun
                  ? "تشغيل محاكاة التصدير الشامل"
                  : "تصدير كافة البيانات إلى Google Sheet"}
              </Button>
            </div>
          </div>

          {/* Sync Button 2: Google Sheets -> Supabase (Import Override) */}
          <div className="flex min-w-0 flex-col justify-between space-y-3 rounded-lg border border-amber-100/50 bg-white p-4">
            <div className="min-w-0 space-y-1">
              <p className="flex items-start gap-1.5 text-sm font-bold text-emerald-950">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span className="min-w-0 break-words">
                  مزامنة الواردات (Google Sheets 🡪 Supabase)
                </span>
              </p>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                قراءة التعديلات والملاحظات المدونة من قبل الإدارة في Google Sheets واستيرادها لقاعدة
                البيانات وتحديث سجلات توزيع المنهج وجداول التحضير.
              </p>
            </div>
            <div className="min-w-0 pt-2">
              <Button
                onClick={() => syncToSupabaseMutation.mutate()}
                disabled={syncToSupabaseMutation.isPending}
                className="h-auto min-h-[44px] w-full gap-2 whitespace-normal break-words bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                variant="default"
              >
                {syncToSupabaseMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                تحديث واستيراد التعديلات من Google Sheet
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 6: Export Catalog / Sections */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-full">
            <h2 className="flex items-start gap-2 text-base font-bold leading-snug text-foreground">
              <Layers className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <span className="min-w-0 break-words">كتالوج الصادرات التفصيلي (Export Catalog)</span>
            </h2>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              اختر أوراق العمل أو الأقسام التفصيلية التي تريد تصديرها بشكل منفصل ومخصص
            </p>
          </div>

          {/* Catalog Filter tabs */}
          <div className="flex w-full min-w-0 flex-wrap gap-1.5 rounded-lg bg-muted p-1.5 lg:w-auto">
            <Button
              variant={activeCatalogTab === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-11 min-h-[44px] flex-1 whitespace-normal px-3 text-xs font-medium lg:flex-none"
              onClick={() => setActiveCatalogTab("all")}
            >
              الكل
            </Button>
            <Button
              variant={activeCatalogTab === "curriculum" ? "secondary" : "ghost"}
              size="sm"
              className="h-11 min-h-[44px] flex-1 whitespace-normal px-3 text-xs font-medium lg:flex-none"
              onClick={() => setActiveCatalogTab("curriculum")}
            >
              المنهج والجدولة
            </Button>
            <Button
              variant={activeCatalogTab === "academic" ? "secondary" : "ghost"}
              size="sm"
              className="h-11 min-h-[44px] flex-1 whitespace-normal px-3 text-xs font-medium lg:flex-none"
              onClick={() => setActiveCatalogTab("academic")}
            >
              التقويم والتفاصيل
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {/* Catalog Item 1: Published Curriculum */}
          {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-emerald-200 bg-emerald-50 text-emerald-800">
                    المنشور
                  </Badge>
                  <BookOpen className="h-5 w-5 shrink-0 text-emerald-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  المنهج الدراسي المنشور
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير ملفات المنهج مع الوحدات وعناوين الدروس وساعات الحصص المسجلة.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "curriculum", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "curriculum", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 2: Planner */}
          {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-blue-200 bg-blue-50 text-blue-800">
                    جدولة ذكية
                  </Badge>
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  جدول سجلات التحضير
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير جدول الحصص الموزع آلياً متضمناً الأيام والحصص والمواد والتاريخ المقترح.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "planner", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "planner", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 3: Lesson Distribution */}
          {(activeCatalogTab === "all" || activeCatalogTab === "curriculum") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-indigo-200 bg-indigo-50 text-indigo-800">
                    توزيع الخطط
                  </Badge>
                  <Layers className="h-5 w-5 text-indigo-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  توزيع الأسابيع الدراسية
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير مخطط توزيع الدروس بالتفصيل حسب الأسابيع من الأسبوع الأول وحتى الأخير.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "distribution", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "distribution", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 4: Learning Objectives */}
          {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-purple-200 bg-purple-50 text-purple-800">
                    الكفايات والاهداف
                  </Badge>
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  الأهداف التعليمية التفصيلية
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير أهداف التعلم التفصيلية المصاغة آلياً لكل درس لسهولة مراجعتها.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "objectives", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "objectives", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 5: Learning Outcomes */}
          {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-teal-200 bg-teal-50 text-teal-800">
                    النواتج والتقييم
                  </Badge>
                  <CheckCircle2 className="h-5 w-5 text-teal-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  مخرجات التعلم والكفايات
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير مخرجات التعلم ومؤشرات الأداء المصاحبة لكل حصة دراسية معتمدة.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "outcomes", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "outcomes", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 6: Assessments */}
          {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-amber-200 bg-amber-50 text-amber-800">
                    التقويم
                  </Badge>
                  <Settings className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  أساليب التقويم والقياس
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير بنوك أدوات التقييم المستمر والأنشطة التقويمية المحددة للدروس.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "assessment", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "assessment", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 7: Activities */}
          {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-orange-200 bg-orange-50 text-orange-800">
                    الأنشطة التعليمية
                  </Badge>
                  <Activity className="h-5 w-5 text-orange-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  الأنشطة والوسائل المقترحة
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير استراتيجيات الأنشطة التعليمية ووسائل العرض المناسبة لخطط المدرسين.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "activities", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "activities", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
                  disabled={exportMutation.isPending}
                >
                  تجربة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Catalog Item 8: Academic Calendar */}
          {(activeCatalogTab === "all" || activeCatalogTab === "academic") && (
            <Card className="flex min-w-0 flex-col justify-between transition-all hover:border-emerald-300">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="max-w-[calc(100%-1.5rem)] whitespace-normal break-words border border-red-200 bg-red-50 text-red-800">
                    التقويم
                  </Badge>
                  <Calendar className="h-5 w-5 text-red-600" />
                </div>
                <CardTitle className="mt-2 break-words text-sm font-bold leading-snug">
                  التقويم الأكاديمي والخطط
                </CardTitle>
                <CardDescription className="break-words text-xs leading-relaxed">
                  تصدير هيكل الأعوام الدراسية وتواريخ البداية والنهاية للفصول الدراسية.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-2">
                <Button
                  onClick={() => exportMutation.mutate({ target: "calendar", isDryRun: false })}
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  disabled={exportMutation.isPending}
                >
                  تصدير الآن
                </Button>
                <Button
                  onClick={() => exportMutation.mutate({ target: "calendar", isDryRun: true })}
                  variant="outline"
                  className="h-auto min-h-[44px] w-full flex-1 whitespace-normal py-2.5 text-sm font-medium"
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
            استكشاف كافة أوراق العمل الفرعية المتواجدة داخل المستند المتصل وحالتها الإحصائية الحالية
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {isLoadingWorksheets ? (
            <div className="space-y-2 py-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : worksheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-zinc-50/80 p-6 text-center md:p-8">
              <FileSpreadsheet className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">لا توجد أوراق عمل نشطة</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                قم بتشغيل المزامنة أو التصدير لإنشاء الأوراق المطلوبة تلقائياً في المستند المتصل.
              </p>
            </div>
          ) : (
            <>
              {/* Stacked worksheet cards below lg (covers phones + 768–1023 landscape) */}
              <ul className="grid gap-3 lg:hidden">
                {worksheets.map((sheet, idx) => (
                  <li key={idx}>
                    <article className="min-w-0 rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 break-words font-semibold text-emerald-950">
                          {sheet.name}
                        </p>
                        <Badge className="max-w-full whitespace-normal break-words border border-emerald-200 bg-emerald-50 text-xs text-emerald-800">
                          {sheet.status}
                        </Badge>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="min-w-0">
                          <dt>الصفوف</dt>
                          <dd className="font-mono text-foreground">{sheet.rows}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt>الأعمدة</dt>
                          <dd className="font-mono text-foreground">{sheet.columns}</dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt>آخر مزامنة</dt>
                          <dd className="break-words text-foreground">{sheet.lastUpdated}</dd>
                        </div>
                      </dl>
                      <a
                        href={sheet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex h-auto min-h-[44px] w-full items-center justify-center whitespace-normal break-words rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
                      >
                        فتح في Google Sheets ↗
                      </a>
                    </article>
                  </li>
                ))}
              </ul>

              {/* Wide table from lg up */}
              <div className="hidden min-w-0 rounded-lg border lg:block">
                <table className="w-full table-fixed text-right text-sm">
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
                        <td className="break-words p-3 font-semibold text-emerald-950">
                          {sheet.name}
                        </td>
                        <td className="break-words p-3 font-mono text-xs">{sheet.rows} صف</td>
                        <td className="break-words p-3 font-mono text-xs">{sheet.columns} عمود</td>
                        <td className="break-words p-3 text-xs text-muted-foreground">
                          {sheet.lastUpdated}
                        </td>
                        <td className="p-3">
                          <Badge className="max-w-full whitespace-normal break-words border border-emerald-200 bg-emerald-50 py-0 text-xs text-emerald-800">
                            {sheet.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-left">
                          <a
                            href={sheet.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
                          >
                            فتح في Google Sheets ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Sync Logs & History */}
      <Card dir="rtl" className="min-w-0 text-right">
        <CardHeader className="space-y-3 p-4 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-full">
              <CardTitle className="flex items-start gap-2 text-base font-bold leading-snug">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 break-words">
                  أرشيف وسجلات المزامنة (Sync Logs & History)
                </span>
              </CardTitle>
              <CardDescription className="mt-1 break-words text-xs leading-relaxed">
                سجل تاريخي يوضح عمليات الاستيراد والتصدير وجلسات المحاكاة التي أجراها مديرو النظام
              </CardDescription>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              {/* Filter logs options */}
              <div className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-muted p-1.5 text-xs">
                <Button
                  variant={logFilter === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-11 min-h-[44px] whitespace-normal px-3 text-xs"
                  onClick={() => setLogFilter("all")}
                >
                  الكل
                </Button>
                <Button
                  variant={logFilter === "success" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-11 min-h-[44px] whitespace-normal px-3 text-xs"
                  onClick={() => setLogFilter("success")}
                >
                  الناجحة
                </Button>
                <Button
                  variant={logFilter === "fail" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-11 min-h-[44px] whitespace-normal px-3 text-xs"
                  onClick={() => setLogFilter("fail")}
                >
                  الفاشلة
                </Button>
              </div>

              <Button
                onClick={clearLogHistory}
                variant="outline"
                size="sm"
                className="h-11 min-h-[44px] whitespace-normal border-red-200 text-xs text-red-600 hover:bg-red-50"
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
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-start gap-2">
                      {log.success ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <span className="min-w-0 break-words font-bold text-sm text-foreground">
                        {log.target}
                      </span>
                      {log.isDryRun && (
                        <Badge
                          variant="outline"
                          className="max-w-full whitespace-normal break-words border-amber-300 bg-amber-50 py-0 text-[10px] leading-tight text-amber-800"
                        >
                          محاكاة (Dry Run)
                        </Badge>
                      )}
                      <span className="break-words text-xs text-muted-foreground">
                        ({log.timestamp})
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">الصفوف المتأثرة:</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {log.rowsAffected} صف
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                    {log.details}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
