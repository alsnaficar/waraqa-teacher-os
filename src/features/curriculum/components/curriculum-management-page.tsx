import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Sparkles,
  FileText,
  Trash2,
  Plus,
  Combine,
  Layers,
  Check,
  Archive as ArchiveIcon,
  ArrowLeft,
  AlertTriangle,
  Edit3,
  Eye,
  ChevronDown,
  Loader2,
  BookOpen,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { supabase } from "@/platform/database/supabase/client";
import { getTermsLabelMap } from "@/platform/config/academic-config";
import { toast } from "sonner";

import {
  extractCurriculumFromPdf,
  saveCurriculumDraft,
  publishCurriculum,
  archiveCurriculum,
  deleteCurriculumDraft,
  getAdminCurriculumFiles,
  getAdminCurriculumLessons,
} from "@/platform/curriculum/curriculum-management.functions";
import {
  CURRICULUM_PDF_TOO_LARGE_MESSAGE,
  MAX_CURRICULUM_PDF_BYTES,
} from "@/platform/curriculum/curriculum-pdf-limits";

interface ExtractedLesson {
  id?: string;
  unitNumber?: string;
  unitName?: string;
  lessonNumber?: string;
  lessonTitle: string;
  objectives?: string;
  outcomes?: string;
  activities?: string;
  assessment?: string;
  periods?: string;
  notes?: string;
}

interface CurriculumData {
  id?: string;
  originalName: string;
  academicYear: string;
  semester: string;
  stage: string;
  grade: string;
  subject: string;
  version: string;
  lessons: ExtractedLesson[];
}

export function CurriculumManagementPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Authentication & permission states
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // Core wizard states
  const [isExtracting, setIsExtracting] = useState(false);
  const [reviewData, setReviewData] = useState<CurriculumData | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "review" | "upload">("list");
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "published" | "archived">(
    "all",
  );

  // Check admin permission on load
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
  }, []);

  // Fetch admin curriculum files
  const {
    data: files = [],
    isLoading: isLoadingFiles,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ["admin-curriculum-files"],
    queryFn: () => getAdminCurriculumFiles(),
    enabled: !!isAdmin,
  });

  // Extract PDF Mutation
  const extractMutation = useMutation({
    mutationFn: (base64: string) =>
      extractCurriculumFromPdf({
        data: { pdfBase64: base64 },
      }),

    onSuccess: (data) => {
      setIsExtracting(false);

      const lessonsData = Array.isArray(data?.lessons) ? data.lessons : [];

      setReviewData({
        originalName: "curriculum_upload.pdf",
        academicYear: data.academicYear || "1446",
        semester: data.semester || "1",
        stage: data.stage || "primary",
        grade: data.grade || "",
        subject: data.subject || "",
        version: "1.0",
        lessons: lessonsData.map((l: unknown) => {
          const item = l as Record<string, unknown>;
          return {
            unitNumber: String(item.unitNumber || ""),
            unitName: String(item.unitName || ""),
            lessonNumber: String(item.lessonNumber || ""),
            lessonTitle: String(item.lessonTitle || "عنوان الدرس"),
            objectives: String(item.objectives || ""),
            outcomes: String(item.outcomes || ""),
            activities: String(item.activities || ""),
            assessment: String(item.assessment || ""),
            periods: String(item.periods || "1"),
            notes: String(item.notes || ""),
          };
        }),
      });
      setActiveTab("review");
      toast.success("تم استخراج المنهج بنجاح باستخدام Gemini!");
    },
    onError: (err: unknown) => {
      setIsExtracting(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل استخراج المنهج: ${errMsg}`);
    },
  });

  // Save Draft Mutation
  const saveDraftMutation = useMutation({
    mutationFn: (data: CurriculumData) =>
      saveCurriculumDraft({
        data,
      }),

    onSuccess: () => {
      toast.success("تم حفظ المنهج كمسودة بنجاح!");
      setActiveTab("list");
      setReviewData(null);
      refetchFiles();
      queryClient.invalidateQueries({ queryKey: ["curriculum-files"] });
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل حفظ المسودة: ${errMsg}`);
    },
  });

  // Publish Mutation
  const publishMutation = useMutation({
    mutationFn: (fileId: string) =>
      publishCurriculum({
        data: { fileId },
      }),
    onSuccess: () => {
      toast.success("تم نشر المنهج وجعله متاحاً لجميع المعلمين!");
      refetchFiles();
      queryClient.invalidateQueries({ queryKey: ["curriculum-files"] });
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل النشر: ${errMsg}`);
    },
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: (fileId: string) =>
      archiveCurriculum({
        data: { fileId },
      }),
    onSuccess: () => {
      toast.success("تم أرشفة المنهج.");
      refetchFiles();
      queryClient.invalidateQueries({ queryKey: ["curriculum-files"] });
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل الأرشفة: ${errMsg}`);
    },
  });

  // Delete Draft Mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      deleteCurriculumDraft({
        data: { fileId },
      }),
    onSuccess: () => {
      toast.success("تم حذف المسودة بنجاح.");
      refetchFiles();
    },
    onError: (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل حذف المسودة: ${errMsg}`);
    },
  });

  interface AdminFile {
    id: string;
    original_name: string;
    academic_year: string | null;
    semester: string | null;
    grade: string | null;
    subject: string | null;
    status: string;
    created_at: string;
  }

  // Load Draft to edit/review
  const handleEditDraft = async (file: AdminFile) => {
    toast.info("جاري تحميل تفاصيل المنهج...");
    try {
      const lessons = await getAdminCurriculumLessons({
        data: { fileId: file.id },
      });
      setReviewData({
        id: file.id,
        originalName: file.original_name,
        academicYear: file.academic_year || "",
        semester: file.semester || "",
        stage: file.grade?.includes("متوسط")
          ? "intermediate"
          : file.grade?.includes("ثانوي")
            ? "secondary"
            : "primary",
        grade: file.grade || "",
        subject: file.subject || "",
        version: "1.0",
        lessons: lessons,
      });
      setActiveTab("review");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`فشل تحميل التفاصيل: ${errMsg}`);
    }
  };

  // Read PDF & Convert to Base64
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("يرجى اختيار ملف PDF رسمي فقط.");
      return;
    }

    // Reject before FileReader so oversized PDFs never enter memory as data URLs.
    if (file.size > MAX_CURRICULUM_PDF_BYTES) {
      toast.error(CURRICULUM_PDF_TOO_LARGE_MESSAGE);
      return;
    }

    setIsExtracting(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      extractMutation.mutate(base64);
    };
    reader.onerror = () => {
      setIsExtracting(false);
      toast.error("فشل قراءة الملف.");
    };
    reader.readAsDataURL(file);
  };

  // Lesson manipulation helpers
  const updateLessonField = (idx: number, field: keyof ExtractedLesson, val: string) => {
    if (!reviewData) return;
    const updated = [...reviewData.lessons];
    updated[idx] = { ...updated[idx], [field]: val };
    setReviewData({ ...reviewData, lessons: updated });
  };

  const handleDeleteLesson = (idx: number) => {
    if (!reviewData) return;
    const updated = reviewData.lessons.filter((_, i) => i !== idx);
    setReviewData({ ...reviewData, lessons: updated });
    toast.success("تم حذف الدرس من المراجعة.");
  };

  const handleAddLesson = (idx: number) => {
    if (!reviewData) return;
    const newLesson: ExtractedLesson = {
      lessonTitle: "درس جديد",
      unitNumber: reviewData.lessons[idx]?.unitNumber || "",
      unitName: reviewData.lessons[idx]?.unitName || "",
      lessonNumber: "",
      objectives: "",
      outcomes: "",
      activities: "",
      assessment: "",
      periods: "1",
      notes: "",
    };
    const updated = [...reviewData.lessons];
    updated.splice(idx + 1, 0, newLesson);
    setReviewData({ ...reviewData, lessons: updated });
    toast.success("تم إضافة درس جديد.");
  };

  const handleSplitLesson = (idx: number) => {
    if (!reviewData) return;
    const current = reviewData.lessons[idx];
    const newLesson: ExtractedLesson = {
      ...current,
      lessonTitle: `${current.lessonTitle} (جزء 2)`,
      lessonNumber: current.lessonNumber ? `${current.lessonNumber}-ب` : "",
    };
    const updated = [...reviewData.lessons];
    updated.splice(idx + 1, 0, newLesson);
    setReviewData({ ...reviewData, lessons: updated });
    toast.success("تم تقسيم الدرس بنجاح.");
  };

  const handleMergeLesson = (idx: number) => {
    if (!reviewData || idx >= reviewData.lessons.length - 1) return;
    const current = reviewData.lessons[idx];
    const next = reviewData.lessons[idx + 1];

    const merged: ExtractedLesson = {
      ...current,
      lessonTitle: `${current.lessonTitle} + ${next.lessonTitle}`,
      objectives: [current.objectives, next.objectives].filter(Boolean).join("\n"),
      outcomes: [current.outcomes, next.outcomes].filter(Boolean).join("\n"),
      activities: [current.activities, next.activities].filter(Boolean).join("\n"),
      assessment: [current.assessment, next.assessment].filter(Boolean).join("\n"),
      notes: [current.notes, next.notes].filter(Boolean).join("\n"),
      periods: String(Number(current.periods || 1) + Number(next.periods || 1)),
    };

    const updated = reviewData.lessons.filter((_, i) => i !== idx && i !== idx + 1);
    updated.splice(idx, 0, merged);
    setReviewData({ ...reviewData, lessons: updated });
    toast.success("تم دمج الدرس مع الدرس التالي بنجاح.");
  };

  // Render unauthorized if not admin
  if (checkingAdmin) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            جاري التحقق من الصلاحيات والملفات الدراسية...
          </p>
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg mt-12 p-6 text-center">
          <Card className="border-destructive/30">
            <CardHeader className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">غير مصرح بالدخول</CardTitle>
              <CardDescription className="text-sm mt-1">
                عذراً، هذه الصفحة مخصصة لمدراء النظام فقط لرفع وتوزيع المناهج الرسمية لوزارة
                التعليم.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate({ to: "/dashboard" })} className="w-full">
                العودة للرئيسية
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
        id="management-header"
      >
        <SectionHeader
          title="إدارة المناهج الرسمية"
          description="بوابة مدراء النظام لرفع وتدقيق ونشر مناهج وزارة التعليم السعودية لكل المعلمين."
        />
        {activeTab === "list" && (
          <Button onClick={() => setActiveTab("upload")} className="h-11 px-5 font-semibold gap-2">
            <Upload className="h-5 w-5" />
            استيراد منهج PDF جديد
          </Button>
        )}
        {activeTab !== "list" && (
          <Button
            variant="outline"
            onClick={() => {
              setActiveTab("list");
              setReviewData(null);
            }}
            className="h-11 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة للقائمة
          </Button>
        )}
      </div>

      {/* --- EXTRACTION LOADING STATE --- */}
      {isExtracting && (
        <Card className="border-primary/20 bg-primary/5 mb-8">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse text-primary mb-4">
                <Sparkles className="h-8 w-8 animate-spin" />
              </div>
              <Loader2 className="absolute -top-1 -right-1 h-5 w-5 animate-spin text-primary" />
            </div>
            <h3 className="text-lg font-bold">جاري تحليل المنهج عبر ذكاء الاصطناعي Gemini...</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              يقوم نموذج Gemini بقراءة ملف المنهج PDF وتفكيك الوحدات والدروس، والأهداف التعليمية
              والمقترحات والتقييمات بالكامل. قد يستغرق هذا دقيقة واحدة.
            </p>
          </CardContent>
        </Card>
      )}

      {/* --- TAB 1: LIST OF CURRICULUM FILES --- */}
      {activeTab === "list" && (
        <div className="space-y-6">
          <div className="flex gap-2 flex-wrap bg-muted/40 p-1.5 rounded-xl max-w-md">
            <Button
              variant={filterStatus === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus("all")}
              className="rounded-lg"
            >
              الكل ({files.length})
            </Button>
            <Button
              variant={filterStatus === "published" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus("published")}
              className="rounded-lg text-emerald-600 dark:text-emerald-400"
            >
              المنشورة ({files.filter((f) => f.status === "published").length})
            </Button>
            <Button
              variant={filterStatus === "draft" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus("draft")}
              className="rounded-lg text-amber-600 dark:text-amber-400"
            >
              المسودات ({files.filter((f) => f.status === "draft").length})
            </Button>
            <Button
              variant={filterStatus === "archived" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus("archived")}
              className="rounded-lg text-slate-500"
            >
              المؤرشفة ({files.filter((f) => f.status === "archived").length})
            </Button>
          </div>

          {files.length === 0 ? (
            <Card className="p-8 text-center flex flex-col items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="font-bold text-lg">لا توجد مناهج مرفوعة بعد</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                ابدأ برفع ملف منهج PDF رسمي، وسيقوم Gemini بتحويله تلقائياً لقاعدة بيانات مهيكلة.
              </p>
              <Button onClick={() => setActiveTab("upload")} className="mt-4 gap-2">
                <Upload className="h-4 w-4" />
                رفع المنهج الأول
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {files
                .filter((f) => filterStatus === "all" || f.status === filterStatus)
                .map((file) => {
                  const isPublished = file.status === "published";
                  const isDraft = file.status === "draft";
                  const isArchived = file.status === "archived";

                  return (
                    <Card
                      key={file.id}
                      className="transition-all hover:shadow-md flex flex-col justify-between"
                    >
                      <CardHeader className="p-5 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <FileText className="h-5 w-5" />
                          </div>
                          <Badge
                            variant={isPublished ? "default" : isDraft ? "secondary" : "outline"}
                            className={
                              isPublished
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : isDraft
                                  ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-slate-100 text-slate-800"
                            }
                          >
                            {isPublished ? "منشور رسمياً" : isDraft ? "مسودة تدقيق" : "مؤرشف"}
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <h4 className="font-bold text-sm line-clamp-1">{file.original_name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {[
                              file.subject,
                              file.grade,
                              file.semester ? `الفصل ${file.semester}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 pt-0 space-y-4">
                        <div className="border-t pt-3 flex flex-wrap gap-2 justify-between items-center">
                          <div className="text-[10px] text-muted-foreground">
                            تاريخ الرفع: {new Date(file.created_at).toLocaleDateString("ar-SA")}
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {isDraft && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditDraft(file)}
                                  className="h-8 text-xs gap-1"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  مراجعة وتدقيق
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => publishMutation.mutate(file.id)}
                                >
                                  <Check className="h-3 w-3" />
                                  نشر
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-destructive hover:bg-destructive/5"
                                  onClick={() => {
                                    if (confirm("هل أنت متأكد من حذف هذه المسودة؟")) {
                                      deleteMutation.mutate(file.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}

                            {isPublished && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1 text-slate-600"
                                onClick={() => archiveMutation.mutate(file.id)}
                              >
                                <ArchiveIcon className="h-3 w-3" />
                                أرشفة المنهج
                              </Button>
                            )}

                            {isArchived && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <ArchiveIcon className="h-3 w-3" />
                                مؤرشف لا يستعمل
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: UPLOAD FILE SCREEN --- */}
      {activeTab === "upload" && !isExtracting && (
        <div className="mx-auto max-w-2xl">
          <Card className="border-dashed border-2">
            <CardHeader className="text-center">
              <CardTitle>رفع وتفكيك المنهج</CardTitle>
              <CardDescription>
                اختر ملف توزيع منهج الوزارة الرسمي بصيغة PDF وسنتولى تفكيكه وهيكلته بالكامل بالذكاء
                الاصطناعي.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 flex flex-col items-center justify-center border-t border-dashed">
              <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-4">
                <Upload className="h-8 w-8" />
              </div>
              <Label htmlFor="pdf-file-upload" className="cursor-pointer">
                <div className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors">
                  تصفح الملفات واختيار المنهج
                </div>
                <Input
                  id="pdf-file-upload"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handlePdfUpload}
                />
              </Label>
              <p className="text-xs text-muted-foreground mt-3">
                الملفات المدعومة: PDF فقط (بحد أقصى 10 ميجابايت)
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- TAB 3: REVIEW AND EDIT EXTRACTED CURRICULUM --- */}
      {activeTab === "review" && reviewData && (
        <div className="space-y-6">
          {/* Header Action Row */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  مراجعة وتدقيق المنهج المستخرج
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  يرجى التأكد من دقة البيانات والوحدات والدروس قبل الحفظ. لن يظهر المنهج للمعلمين
                  إلا بعد النشر.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => saveDraftMutation.mutate(reviewData)}
                  disabled={saveDraftMutation.isPending}
                  className="h-11 px-5"
                >
                  {saveDraftMutation.isPending ? "جاري الحفظ..." : "حفظ كمسودة تدقيق"}
                </Button>
                <Button
                  onClick={async () => {
                    // Save first, then publish
                    toast.promise(
                      (async () => {
                        const { fileId } = await saveCurriculumDraft({
                          data: reviewData,
                        });

                        await publishCurriculum({
                          data: { fileId },
                        });
                      })(),
                      {
                        loading: "جاري حفظ ونشر المنهج الجديد...",
                        success: "تم حفظ ونشر المنهج بنجاح متاحاً للجميع!",
                        error: "فشل الحفظ والنشر.",
                      },
                    );
                    setActiveTab("list");
                    setReviewData(null);
                    refetchFiles();
                  }}
                  className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  حفظ ونشر رسمياً
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Metadata Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">معلومات المنهج الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-subject">المادة الدراسية</Label>
                  <Input
                    id="meta-subject"
                    value={reviewData.subject}
                    onChange={(e) => setReviewData({ ...reviewData, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-grade">الصف الدراسي</Label>
                  <Input
                    id="meta-grade"
                    value={reviewData.grade}
                    onChange={(e) => setReviewData({ ...reviewData, grade: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-semester">الفصل الدراسي</Label>
                  <Select
                    value={reviewData.semester}
                    onValueChange={(val) => setReviewData({ ...reviewData, semester: val })}
                  >
                    <SelectTrigger id="meta-semester">
                      <SelectValue placeholder="اختر الفصل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">الفصل الأول</SelectItem>
                      <SelectItem value="2">الفصل الثاني</SelectItem>
                      <SelectItem value="3">الفصل الثالث</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-year">العام الدراسي</Label>
                  <Input
                    id="meta-year"
                    value={reviewData.academicYear}
                    onChange={(e) => setReviewData({ ...reviewData, academicYear: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-stage">المرحلة الدراسية</Label>
                  <Select
                    value={reviewData.stage}
                    onValueChange={(val) => setReviewData({ ...reviewData, stage: val })}
                  >
                    <SelectTrigger id="meta-stage">
                      <SelectValue placeholder="اختر المرحلة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">الابتدائية</SelectItem>
                      <SelectItem value="intermediate">المتوسطة</SelectItem>
                      <SelectItem value="secondary">الثانوية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-version">الإصدار / النسخة</Label>
                  <Input
                    id="meta-version"
                    value={reviewData.version}
                    onChange={(e) => setReviewData({ ...reviewData, version: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lessons list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between" id="lessons-list-title">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                توزيع الدروس المستخرجة ({reviewData.lessons.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newLesson: ExtractedLesson = {
                    lessonTitle: "درس جديد",
                    unitNumber: "",
                    unitName: "",
                    lessonNumber: "",
                    objectives: "",
                    outcomes: "",
                    activities: "",
                    assessment: "",
                    periods: "1",
                    notes: "",
                  };
                  setReviewData({ ...reviewData, lessons: [newLesson, ...reviewData.lessons] });
                  toast.success("تم إضافة درس في البداية.");
                }}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                إضافة درس جديد في البداية
              </Button>
            </div>

            <div className="space-y-4">
              {reviewData.lessons.map((lesson, idx) => (
                <Card
                  key={idx}
                  className="border-l-4 border-l-primary/60 transition-all hover:border-l-primary"
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Header Controls for each Lesson */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/30 p-2.5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-white">
                          الدرس {idx + 1}
                        </Badge>
                        <Input
                          placeholder="رقم الدرس (مثال: 1-2)"
                          value={lesson.lessonNumber || ""}
                          onChange={(e) => updateLessonField(idx, "lessonNumber", e.target.value)}
                          className="h-8 text-xs font-semibold w-32 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMergeLesson(idx)}
                          disabled={idx === reviewData.lessons.length - 1}
                          className="h-8 text-xs gap-1 text-indigo-600 hover:bg-indigo-50"
                          title="دمج هذا الدرس مع الدرس التالي لتسهيل الإدارة"
                        >
                          <Combine className="h-3.5 w-3.5" />
                          دمج مع التالي
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSplitLesson(idx)}
                          className="h-8 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                          title="تقسيم هذا الدرس إلى جزئين"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          تقسيم الدرس
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddLesson(idx)}
                          className="h-8 text-xs gap-1 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          إضافة تحت
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLesson(idx)}
                          className="h-8 text-xs text-destructive hover:bg-destructive/5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Lesson Core Metadata inputs */}
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">رقم الوحدة</Label>
                        <Input
                          placeholder="مثال: الأولى"
                          value={lesson.unitNumber || ""}
                          onChange={(e) => updateLessonField(idx, "unitNumber", e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">اسم الوحدة الدراسية</Label>
                        <Input
                          placeholder="مثال: القيمة المنزلية"
                          value={lesson.unitName || ""}
                          onChange={(e) => updateLessonField(idx, "unitName", e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">عنوان الدرس المستهدف</Label>
                        <Input
                          placeholder="مثال: مقارنة الكسور العشرية"
                          value={lesson.lessonTitle}
                          onChange={(e) => updateLessonField(idx, "lessonTitle", e.target.value)}
                          className="h-9 text-sm font-semibold"
                        />
                      </div>
                    </div>

                    {/* Lesson Objectives & Outcomes fields */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">الأهداف التعليمية (Objectives)</Label>
                        <Textarea
                          placeholder="اكتب الأهداف التعليمية للدرس..."
                          value={lesson.objectives || ""}
                          onChange={(e) => updateLessonField(idx, "objectives", e.target.value)}
                          className="text-xs min-h-[70px] leading-relaxed"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">مخرجات التعلم المستهدفة (Outcomes)</Label>
                        <Textarea
                          placeholder="اكتب المخرجات المتوقعة من الطالب..."
                          value={lesson.outcomes || ""}
                          onChange={(e) => updateLessonField(idx, "outcomes", e.target.value)}
                          className="text-xs min-h-[70px] leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Lesson Activities & Assessment fields */}
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                      <div className="space-y-1 sm:col-span-1">
                        <Label className="text-xs">الأنشطة التعليمية المقترحة</Label>
                        <Textarea
                          placeholder="اكتب الاستراتيجيات أو الأنشطة المقترحة للدرس..."
                          value={lesson.activities || ""}
                          onChange={(e) => updateLessonField(idx, "activities", e.target.value)}
                          className="text-xs min-h-[70px] leading-relaxed"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-1">
                        <Label className="text-xs">أساليب تقييم الفهم</Label>
                        <Textarea
                          placeholder="اكتب أساليب أو استمارات تقييم استيعاب الطلاب..."
                          value={lesson.assessment || ""}
                          onChange={(e) => updateLessonField(idx, "assessment", e.target.value)}
                          className="text-xs min-h-[70px] leading-relaxed"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2 md:col-span-1 grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">عدد الحصص (Periods)</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            value={lesson.periods || "1"}
                            onChange={(e) => updateLessonField(idx, "periods", e.target.value)}
                            className="h-9 text-sm text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ملاحظات إضافية</Label>
                          <Input
                            placeholder="أي ملاحظات..."
                            value={lesson.notes || ""}
                            onChange={(e) => updateLessonField(idx, "notes", e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="pt-4 flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  const newLesson: ExtractedLesson = {
                    lessonTitle: "درس جديد",
                    unitNumber: "",
                    unitName: "",
                    lessonNumber: "",
                    objectives: "",
                    outcomes: "",
                    activities: "",
                    assessment: "",
                    periods: "1",
                    notes: "",
                  };
                  setReviewData({ ...reviewData, lessons: [...reviewData.lessons, newLesson] });
                  toast.success("تم إضافة درس جديد في النهاية.");
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                إضافة درس جديد في النهاية
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => saveDraftMutation.mutate(reviewData)}
                  disabled={saveDraftMutation.isPending}
                >
                  حفظ مسودة فقط
                </Button>
                <Button
                  onClick={async () => {
                    toast.promise(
                      (async () => {
                        const { fileId } = await saveCurriculumDraft({
                          data: reviewData,
                        });

                        await publishCurriculum({
                          data: { fileId },
                        });
                      })(),
                      {
                        loading: "جاري حفظ ونشر المنهج الجديد...",
                        success: "تم حفظ ونشر المنهج بنجاح متاحاً للجميع!",
                        error: "فشل الحفظ والنشر.",
                      },
                    );
                    setActiveTab("list");
                    setReviewData(null);
                    refetchFiles();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  حفظ ونشر المنهج بالكامل
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
