import { BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/shared/components/empty-state";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import type { ReportsDateFilter } from "@/features/reports/services/reports.service";

import { useTestDetailReport, useTestPeriodReport } from "../hooks/useTestReports";
import {
  buildReportsDateFilter,
  buildTestSummaryItems,
  formatTestScoreLabel,
  REPORTS_FILTER_OPTIONS,
  TEST_REPORTS_EMPTY_DESCRIPTION,
  TEST_REPORTS_EMPTY_TITLE,
  TEST_REPORTS_ERROR_TITLE,
  TEST_REPORTS_HINT,
  testStatusLabel,
  testSubmissionStatusLabel,
  type ReportsFilterKind,
} from "../services/test-reports-ui.logic";

function formatDisplayDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TestReportsPanel() {
  const [kind, setKind] = useState<ReportsFilterKind>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedFilter, setAppliedFilter] = useState<ReportsDateFilter>(() =>
    buildReportsDateFilter("week"),
  );
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  const periodQuery = useTestPeriodReport(appliedFilter);
  const detailQuery = useTestDetailReport(selectedTestId);

  const summaryItems = useMemo(
    () => (periodQuery.data ? buildTestSummaryItems(periodQuery.data.summary) : []),
    [periodQuery.data],
  );

  function applyPreset(nextKind: ReportsFilterKind) {
    setKind(nextKind);
    if (nextKind === "custom") return;
    try {
      setAppliedFilter(buildReportsDateFilter(nextKind));
      setSelectedTestId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق التصفية.");
    }
  }

  function applyCustomRange() {
    try {
      const filter = buildReportsDateFilter("custom", { from: customFrom, to: customTo });
      setKind("custom");
      setAppliedFilter(filter);
      setSelectedTestId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق الفترة المخصصة.");
    }
  }

  const rangeLabel = periodQuery.data
    ? `${formatDisplayDate(periodQuery.data.range.from)} — ${formatDisplayDate(periodQuery.data.range.to)}`
    : null;

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">تقارير الاختبارات</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              ملخص قراءة فقط لاختباراتك وتسليماتك ضمن الفترة. لا يُرسل معرّف المعلم من الواجهة.
            </p>
            {rangeLabel ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{rangeLabel}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفترة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REPORTS_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.kind}
                type="button"
                variant={kind === option.kind ? "default" : "outline"}
                className="min-h-11 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto"
                onClick={() => applyPreset(option.kind)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {kind === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="test-reports-from">من</Label>
                <Input
                  id="test-reports-from"
                  type="date"
                  className="min-h-11"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-reports-to">إلى</Label>
                <Input
                  id="test-reports-to"
                  type="date"
                  className="min-h-11"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={applyCustomRange}
                >
                  تطبيق
                </Button>
              </div>
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">{TEST_REPORTS_HINT}</p>
        </CardContent>
      </Card>

      {periodQuery.isPending ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : periodQuery.isError ? (
        <EmptyState
          icon={BarChart3}
          title={TEST_REPORTS_ERROR_TITLE}
          description={
            periodQuery.error instanceof Error
              ? periodQuery.error.message
              : "حدث خطأ أثناء قراءة تقرير الاختبارات."
          }
          action={
            <Button className="min-h-11" onClick={() => void periodQuery.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : !periodQuery.data || periodQuery.data.tests.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={TEST_REPORTS_EMPTY_TITLE}
          description={TEST_REPORTS_EMPTY_DESCRIPTION}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <Card key={item.key} className="min-w-0">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="truncate text-lg font-bold tabular-nums">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">اختبارات الفترة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden overflow-x-auto rounded-xl border md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 text-start font-medium">العنوان</th>
                      <th className="px-3 py-3 text-start font-medium">المادة</th>
                      <th className="px-3 py-3 text-start font-medium">الموعد</th>
                      <th className="px-3 py-3 text-start font-medium">الحالة</th>
                      <th className="px-3 py-3 text-start font-medium">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodQuery.data.tests.map((row) => {
                      const selected = selectedTestId === row.id;
                      return (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-3 font-medium">{row.title}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {row.subject ?? "—"}
                          </td>
                          <td className="px-3 py-3">
                            {row.dueDate ? formatDisplayDate(row.dueDate) : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline">{testStatusLabel(row.status)}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <Button
                              type="button"
                              variant={selected ? "default" : "outline"}
                              className="min-h-11"
                              onClick={() => setSelectedTestId(selected ? null : row.id)}
                            >
                              {selected ? "إخفاء" : "عرض"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {periodQuery.data.tests.map((row) => {
                  const selected = selectedTestId === row.id;
                  return (
                    <Card key={row.id} className="min-w-0">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <h3 className="truncate font-bold">{row.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {row.subject ?? "بدون مادة"} ·{" "}
                              {row.dueDate ? formatDisplayDate(row.dueDate) : "بدون موعد"}
                            </p>
                          </div>
                          <Badge variant="outline">{testStatusLabel(row.status)}</Badge>
                        </div>
                        <Button
                          type="button"
                          variant={selected ? "default" : "outline"}
                          className="min-h-11 w-full"
                          onClick={() => setSelectedTestId(selected ? null : row.id)}
                        >
                          {selected ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedTestId ? (
        detailQuery.isPending ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : detailQuery.isError ? (
          <EmptyState
            icon={BarChart3}
            title={TEST_REPORTS_ERROR_TITLE}
            description={
              detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "تعذر تحميل تفاصيل الاختبار."
            }
            action={
              <Button className="min-h-11" onClick={() => void detailQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : !detailQuery.data ? (
          <EmptyState
            icon={BarChart3}
            title="الاختبار غير متاح"
            description="لا يمكن عرض هذا الاختبار أو أنه لا ينتمي لحسابك."
          />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تفاصيل: {detailQuery.data.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Metric label="المادة" value={detailQuery.data.subject ?? "—"} />
                <Metric label="الصف" value={detailQuery.data.grade ?? "—"} />
                <Metric label="الفصل" value={detailQuery.data.className ?? "—"} />
                <Metric
                  label="الموعد"
                  value={
                    detailQuery.data.dueDate
                      ? formatDisplayDate(detailQuery.data.dueDate)
                      : "—"
                  }
                />
                <Metric label="الحالة" value={testStatusLabel(detailQuery.data.status)} />
                <Metric label="عدد الطلاب" value={String(detailQuery.data.numberOfStudents)} />
                <Metric label="مُسلّم" value={String(detailQuery.data.submittedCount)} />
                <Metric label="مُصحّح" value={String(detailQuery.data.gradedCount)} />
                <Metric label="متوسط الدرجة" value={String(detailQuery.data.averageScore)} />
              </div>

              {detailQuery.data.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد تسليمات لهذا الاختبار.</p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-xl border md:block">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3 text-start font-medium">الطالب</th>
                          <th className="px-3 py-3 text-start font-medium">الرمز</th>
                          <th className="px-3 py-3 text-start font-medium">الحالة</th>
                          <th className="px-3 py-3 text-start font-medium">الدرجة</th>
                          <th className="px-3 py-3 text-start font-medium">الملاحظات</th>
                          <th className="px-3 py-3 text-start font-medium">التسليم</th>
                          <th className="px-3 py-3 text-start font-medium">التصحيح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailQuery.data.students.map((row) => (
                          <tr key={row.studentId} className="border-t">
                            <td className="px-3 py-3 font-medium">{row.studentName}</td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {row.studentCode ?? "—"}
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant="outline">
                                {testSubmissionStatusLabel(row.status)}
                              </Badge>
                            </td>
                            <td className="px-3 py-3">
                              {formatTestScoreLabel(row.score, row.maxScore)}
                            </td>
                            <td className="max-w-[12rem] truncate px-3 py-3">
                              {row.feedback?.trim() || "—"}
                            </td>
                            <td className="px-3 py-3">{formatDateTime(row.submittedAt)}</td>
                            <td className="px-3 py-3">{formatDateTime(row.gradedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {detailQuery.data.students.map((row) => (
                      <Card key={row.studentId} className="min-w-0">
                        <CardContent className="space-y-2 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold">{row.studentName}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.studentCode ?? "بدون رمز"}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {testSubmissionStatusLabel(row.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            الدرجة: {formatTestScoreLabel(row.score, row.maxScore)}
                          </p>
                          {row.feedback?.trim() ? (
                            <p className="text-xs text-muted-foreground">
                              ملاحظات: {row.feedback}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            التسليم: {formatDateTime(row.submittedAt)} · التصحيح:{" "}
                            {formatDateTime(row.gradedAt)}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
