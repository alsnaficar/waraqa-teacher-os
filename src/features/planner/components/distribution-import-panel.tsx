import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Eye, RefreshCw } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  approveDistributionSnapshot,
  listDraftSemesterPlansForDistribution,
  previewDistributionCapacity,
  previewDistributionDraft,
} from "@/features/planner/distribution-import.functions";
import type { DraftSemesterPlanOption } from "@/features/planner/services/distribution-snapshot";
import {
  DEFAULT_DISTRIBUTION_WORKSHEET,
  unknownDistributionCapacity,
  type DistributionCurriculumMatch,
  type DistributionDraft,
  type DistributionDraftItem,
  type DistributionItemStatus,
} from "@/features/planner/services/distribution-import.logic";

function statusLabel(status: DistributionItemStatus): string {
  if (status === "ready") return "جاهز";
  if (status === "error") return "خطأ";
  return "يحتاج مراجعة";
}

function curriculumLabel(item: DistributionDraftItem): string {
  if (item.curriculumMatch === "matched") {
    return item.curriculumLessonTitle || "مربوط";
  }
  const labels: Record<DistributionCurriculumMatch, string> = {
    matched: "مربوط",
    missing_id: "غير مربوط",
    not_found: "غير موجود",
    invalid: "معرف غير صالح",
    unchecked: "لم يُتحقق",
  };
  return labels[item.curriculumMatch];
}

function contextValue(value: string | null): string {
  return value || "غير متوفر";
}

export function DistributionImportPanel() {
  const [worksheetName, setWorksheetName] = useState(DEFAULT_DISTRIBUTION_WORKSHEET);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [draft, setDraft] = useState<DistributionDraft | null>(null);
  const [plans, setPlans] = useState<DraftSemesterPlanOption[]>([]);
  const [semesterPlanId, setSemesterPlanId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const demandKey = draft
    ? draft.items.map((item) => (item.periods == null ? "" : String(item.periods))).join(",")
    : null;

  useEffect(() => {
    if (!draft) return;
    let active = true;
    void listDraftSemesterPlansForDistribution()
      .then((rows) => {
        if (!active) return;
        setPlans(rows);
        setSemesterPlanId((prev) =>
          rows.some((row) => row.id === prev) ? prev : (rows[0]?.id ?? ""),
        );
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "تعذر تحميل خطط المسودة.");
      });
    return () => {
      active = false;
    };
  }, [draft]);

  useEffect(() => {
    if (demandKey == null) return;
    const items =
      demandKey === ""
        ? []
        : demandKey.split(",").map((raw) => ({
            periods: raw === "" ? null : Number(raw),
          }));
    if (!semesterPlanId) {
      setDraft((current) => {
        if (!current || current.capacity.status === "unknown") return current;
        return {
          ...current,
          capacity: unknownDistributionCapacity(current.summary.totalPeriods),
        };
      });
      return;
    }
    let active = true;
    void previewDistributionCapacity({
      data: { semesterPlanId, items },
    })
      .then((capacity) => {
        if (!active) return;
        setDraft((current) => (current ? { ...current, capacity } : current));
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "تعذر حساب سعة الخطة.");
      });
    return () => {
      active = false;
    };
  }, [demandKey, semesterPlanId]);

  async function handlePreview() {
    setLoading(true);
    try {
      const next = await previewDistributionDraft({
        data: {
          worksheetName: worksheetName.trim() || DEFAULT_DISTRIBUTION_WORKSHEET,
          semesterPlanId: semesterPlanId || undefined,
        },
      });
      setDraft(next);
      if (next.errors.length) {
        toast.error(next.errors[0]);
        return;
      }
      toast.success(`تمت قراءة ${next.summary.itemCount} صفًا من ورقة التوزيع.`);
    } catch (err) {
      setDraft(null);
      toast.error(err instanceof Error ? err.message : "تعذر قراءة ورقة التوزيع.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!draft) return;
    setApproving(true);
    try {
      const result = await approveDistributionSnapshot({
        data: {
          semesterPlanId,
          confirmed: true,
          acknowledgeWarnings,
          draft: {
            spreadsheetId: draft.spreadsheetId,
            worksheetName: draft.worksheetName,
            items: draft.items,
            summary: draft.summary,
            errors: draft.errors,
            warnings: draft.warnings,
          },
        },
      });
      if (!result.ok) {
        toast.error(result.errors[0] ?? "تعذر اعتماد اللقطة.");
        return;
      }
      toast.success(`تم حفظ لقطة التوزيع (${result.itemCount} عنصرًا).`);
      setConfirmed(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر اعتماد اللقطة.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <Card className="min-w-0 border-sky-100 bg-sky-50/5">
      <CardHeader className="space-y-3 p-4 md:p-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex items-start gap-2 text-base font-bold leading-snug text-sky-900">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <span className="min-w-0 break-words">معاينة التوزيع الدراسي (قراءة فقط)</span>
            </CardTitle>
            <CardDescription className="break-words text-xs leading-relaxed">
              قراءة ورقة التوزيع من Google Sheets والتحقق منها قبل الاعتماد. لا يُحفظ شيء في قاعدة
              البيانات في هذه الخطوة، ولا يوجد اعتماد.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1 basis-full sm:basis-64">
            <Label htmlFor="distribution-worksheet" className="text-xs font-medium">
              اسم ورقة العمل
            </Label>
            <Input
              id="distribution-worksheet"
              value={worksheetName}
              onChange={(event) => setWorksheetName(event.target.value)}
              className="mt-1 h-11 min-h-[44px]"
              dir="rtl"
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handlePreview()}
            disabled={loading}
            className="h-11 min-h-[44px] w-full gap-2 sm:w-auto"
          >
            {draft ? (
              <RefreshCw className="h-4 w-4 shrink-0" />
            ) : (
              <Eye className="h-4 w-4 shrink-0" />
            )}
            {loading ? "جاري القراءة..." : draft ? "إعادة القراءة" : "قراءة المعاينة"}
          </Button>
        </div>

        {draft ? (
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryStat label="العناصر" value={draft.summary.itemCount} />
              <SummaryStat label="مجموع الحصص" value={draft.summary.totalPeriods} />
              <SummaryStat label="جاهز" value={draft.summary.readyCount} tone="ready" />
              <SummaryStat label="مراجعة" value={draft.summary.reviewCount} tone="review" />
              <SummaryStat label="أخطاء" value={draft.summary.errorCount} tone="error" />
              <SummaryStat label="تحذيرات" value={draft.summary.warningCount} tone="warning" />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="outline" className="max-w-full whitespace-normal">
                الورقة: {draft.worksheetName}
              </Badge>
              <Badge variant="outline" className="max-w-full whitespace-normal break-all">
                المعرّف: {draft.spreadsheetId}
              </Badge>
              <Badge variant="outline" className="max-w-full whitespace-normal">
                السعة: {capacityStatusLabel(draft.capacity)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryStat label="طلب التوزيع" value={draft.capacity.totalPeriods} />
              <SummaryStat
                label="الشواغر المتاحة"
                value={draft.capacity.availableSlots}
                tone={draft.capacity.comparison === "deficit" ? "error" : undefined}
              />
              <SummaryStat
                label="الفرق"
                value={draft.capacity.delta}
                tone={
                  draft.capacity.comparison === "deficit"
                    ? "error"
                    : draft.capacity.comparison === "surplus"
                      ? "ready"
                      : undefined
                }
              />
              <SummaryStat label="حصص الأسبوع" value={draft.capacity.weeklyMatchingSlots} />
            </div>

            <p className="break-words text-xs leading-relaxed text-muted-foreground">
              {draft.capacity.note}
              {draft.capacity.teachingDayCount != null
                ? ` أيام التدريس التقويمية: ${draft.capacity.teachingDayCount}.`
                : ""}
            </p>
            {draft.context.note ? (
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                {draft.context.note}
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="min-w-0 break-all">
                  العام: {contextValue(draft.context.academicYearId)}
                </div>
                <div className="min-w-0 break-all">
                  الفصل: {contextValue(draft.context.semesterId)}
                </div>
                <div className="min-w-0 break-all">الصف: {contextValue(draft.context.gradeId)}</div>
                <div className="min-w-0 break-all">
                  المادة: {contextValue(draft.context.subjectId)}
                </div>
                <div className="min-w-0 break-all sm:col-span-2">
                  الخطة: {contextValue(draft.context.semesterPlanId)}
                </div>
              </dl>
            )}

            {draft.errors.length > 0 ? (
              <ul className="space-y-1 text-sm text-red-700">
                {draft.errors.map((error) => (
                  <li key={error} className="break-words">
                    {error}
                  </li>
                ))}
              </ul>
            ) : null}

            {draft.warnings.length > 0 ? (
              <ul className="space-y-1 text-sm text-amber-800">
                {draft.warnings.map((warning) => (
                  <li key={warning} className="break-words">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            {draft.items.length > 0 ? (
              <>
                <ul className="grid grid-cols-1 gap-3 md:hidden">
                  {draft.items.map((item) => (
                    <li key={item.clientId} className="min-w-0 rounded-lg border bg-white p-3.5">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-words text-sm font-bold">
                          {item.order != null ? `${item.order}. ` : ""}
                          {item.lesson || "بدون عنوان"}
                        </p>
                        <StatusBadge status={item.status} />
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                        <div className="min-w-0 break-words">الوحدة: {item.unit || "—"}</div>
                        <div className="min-w-0 break-words">الحصص: {item.periods ?? "—"}</div>
                        <div className="min-w-0 break-words">المنهج: {curriculumLabel(item)}</div>
                        {item.reviewReason ? (
                          <div className="min-w-0 break-words text-amber-800">
                            السبب: {item.reviewReason}
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  ))}
                </ul>

                <div className="hidden min-w-0 md:block">
                  <div
                    className="mb-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-center xl:hidden"
                    dir="rtl"
                  >
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      ↔ اسحب الجدول أفقيًا لعرض بقية الأعمدة
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-right">
                          <th className="px-3 py-2.5 font-semibold">#</th>
                          <th className="px-3 py-2.5 font-semibold">الوحدة</th>
                          <th className="px-3 py-2.5 font-semibold">الدرس</th>
                          <th className="px-3 py-2.5 font-semibold">الحصص</th>
                          <th className="px-3 py-2.5 font-semibold">المنهج</th>
                          <th className="px-3 py-2.5 font-semibold">الحالة</th>
                          <th className="px-3 py-2.5 font-semibold">السبب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.items.map((item) => (
                          <tr key={item.clientId} className="border-b last:border-b-0">
                            <td className="px-3 py-2.5 align-top">{item.order ?? "—"}</td>
                            <td className="max-w-[10rem] px-3 py-2.5 align-top break-words">
                              {item.unit || "—"}
                            </td>
                            <td className="max-w-[14rem] px-3 py-2.5 align-top break-words font-medium">
                              {item.lesson || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top">{item.periods ?? "—"}</td>
                            <td className="max-w-[12rem] px-3 py-2.5 align-top break-words">
                              {curriculumLabel(item)}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="max-w-[16rem] px-3 py-2.5 align-top break-words text-xs text-muted-foreground">
                              {item.reviewReason || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}

            <div className="min-w-0 space-y-3 rounded-lg border border-sky-200 bg-white p-3.5">
              <p className="text-sm font-bold text-sky-950">اعتماد لقطة التوزيع</p>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                تُحفظ اللقطة على مسودة خطة فصل فقط. لا تُولَّد جداول ولا يُعدَّل المحرك في هذه
                الخطوة.
              </p>
              <div className="min-w-0">
                <Label htmlFor="distribution-plan" className="text-xs font-medium">
                  مسودة خطة الفصل
                </Label>
                <select
                  id="distribution-plan"
                  value={semesterPlanId}
                  onChange={(event) => setSemesterPlanId(event.target.value)}
                  className="mt-1 h-11 min-h-[44px] w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">اختر مسودة خطة فصل</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.subject}
                      {plan.grade ? ` — ${plan.grade}` : ""}
                    </option>
                  ))}
                </select>
                {plans.length === 0 ? (
                  <p className="mt-1 break-words text-xs text-amber-800">
                    لا توجد خطط مسودة متاحة. لا تُنشأ خطة تلقائيًا من هنا.
                  </p>
                ) : null}
              </div>
              <label className="flex min-h-[44px] min-w-0 cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span className="min-w-0 break-words leading-snug">
                  أعتمد هذه المسودة وأحفظها كلقطة توزيع مرتبطة بالخطة المحددة.
                </span>
              </label>
              {draft.summary.reviewCount > 0 ? (
                <label className="flex min-h-[44px] min-w-0 cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={acknowledgeWarnings}
                    onChange={(event) => setAcknowledgeWarnings(event.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0"
                  />
                  <span className="min-w-0 break-words leading-snug">
                    أقرّ بوجود عناصر تحتاج مراجعة وأريد المتابعة.
                  </span>
                </label>
              ) : null}
              <Button
                type="button"
                onClick={() => void handleApprove()}
                disabled={
                  approving ||
                  !confirmed ||
                  !semesterPlanId ||
                  draft.summary.errorCount > 0 ||
                  draft.errors.length > 0
                }
                className="h-11 min-h-[44px] w-full gap-2 sm:w-auto"
              >
                {approving ? "جاري الحفظ..." : "اعتماد وحفظ اللقطة"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function capacityStatusLabel(capacity: DistributionDraft["capacity"]): string {
  if (capacity.status === "unknown") return "غير معروفة";
  if (capacity.comparison === "deficit") return "عجز";
  if (capacity.comparison === "surplus") return "فائض";
  return "مطابقة";
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: "ready" | "review" | "error" | "warning";
}) {
  const toneClass =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "review"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "error"
          ? "border-red-200 bg-red-50 text-red-900"
          : tone === "warning"
            ? "border-orange-200 bg-orange-50 text-orange-900"
            : "border-border bg-white text-foreground";
  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[11px] font-medium leading-snug">{label}</p>
      <p className="text-lg font-bold leading-tight">{value == null ? "—" : value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: DistributionItemStatus }) {
  const className =
    status === "ready"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : status === "error"
        ? "bg-red-100 text-red-800 hover:bg-red-100"
        : "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return <Badge className={className}>{statusLabel(status)}</Badge>;
}
