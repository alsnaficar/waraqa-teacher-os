import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";

import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  MAX_CALENDAR_IMPORT_BYTES,
  CALENDAR_IMPORT_TOO_LARGE_MESSAGE,
} from "@/features/calendar/services/calendar-import.limits";
import {
  CALENDAR_EXCEPTION_KINDS,
  CALENDAR_IMPORT_KIND_LABELS,
  emptyManualImportItem,
  reevaluateEditedImportItem,
  type CalendarExceptionKind,
  type CalendarImportDraft,
  type CalendarImportDraftItem,
  type CalendarImportVariantCode,
} from "@/features/calendar/services/calendar-import.logic";
import {
  approveOfficialCalendarImport,
  extractOfficialCalendarDraft,
  listAdminCalendarVariants,
} from "@/platform/calendar/calendar-import.functions";
import { listAdminSemesters } from "@/platform/calendar/academic-calendar.functions";

const FILE_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

type YearOption = { id: string; label: string };
type SemesterOption = { id: string; label: string };
type VariantOption = { code: CalendarImportVariantCode; label: string };

const FALLBACK_VARIANT_OPTIONS: VariantOption[] = [
  { code: "GENERAL", label: "جميع المناطق" },
  { code: "WESTERN", label: "المنطقة الغربية" },
];

function statusLabel(status: CalendarImportDraftItem["status"]): string {
  if (status === "ready") return "جاهز";
  if (status === "duplicate") return "موجود مسبقًا";
  return "يحتاج مراجعة";
}

function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function confidencePct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) {
        reject(new Error("تعذر قراءة الملف."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}

export function CalendarImportPanel({
  years,
  selectedYearId,
  variantCode: controlledVariantCode,
  onVariantCodeChange,
}: {
  years: YearOption[];
  selectedYearId: string | null;
  /** Import context from the academic-year → variant tree. */
  variantCode: CalendarImportVariantCode;
  onVariantCodeChange: (code: CalendarImportVariantCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [academicYearId, setAcademicYearId] = useState(selectedYearId ?? "");
  const [semesterId, setSemesterId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [draft, setDraft] = useState<CalendarImportDraft | null>(null);

  const variantCode = controlledVariantCode;
  const variantOptions = variants.length > 0 ? variants : FALLBACK_VARIANT_OPTIONS;
  const selectedVariantLabel =
    variantOptions.find((row) => row.code === variantCode)?.label ?? variantCode;

  const applyLoadedVariants = (rows: VariantOption[]) => {
    setVariants(rows);
    if (rows.length > 0 && !rows.some((row) => row.code === variantCode)) {
      onVariantCodeChange(rows[0].code);
    }
  };

  useEffect(() => {
    if (selectedYearId) setAcademicYearId(selectedYearId);
  }, [selectedYearId]);

  useEffect(() => {
    let active = true;
    void listAdminCalendarVariants()
      .then((rows) => {
        if (!active) return;
        applyLoadedVariants(rows.map((row) => ({ code: row.code, label: row.label })));
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "تعذر تحميل التقويمات");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!academicYearId) {
      setSemesters([]);
      setSemesterId("");
      return;
    }
    let active = true;
    setLoadingSemesters(true);
    void listAdminSemesters({ data: { academicYearId } })
      .then((rows) => {
        if (!active) return;
        setSemesters(rows.map((row) => ({ id: row.id, label: row.label })));
        setSemesterId((prev) => (rows.some((row) => row.id === prev) ? prev : (rows[0]?.id ?? "")));
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "تعذر تحميل الفصول");
      })
      .finally(() => {
        if (active) setLoadingSemesters(false);
      });
    return () => {
      active = false;
    };
  }, [academicYearId]);

  const openDialog = async () => {
    setOpen(true);
    try {
      const rows = await listAdminCalendarVariants();
      applyLoadedVariants(rows.map((row) => ({ code: row.code, label: row.label })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحميل التقويمات");
    }
  };

  const onVariantChange = (next: string) => {
    if (next === "GENERAL" || next === "WESTERN") {
      onVariantCodeChange(next);
    }
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!academicYearId || !semesterId || !variantCode) {
      toast.error("اختر العام الدراسي والفصل والتقويم قبل الرفع.");
      return;
    }
    if (file.size > MAX_CALENDAR_IMPORT_BYTES) {
      toast.error(CALENDAR_IMPORT_TOO_LARGE_MESSAGE);
      return;
    }

    setExtracting(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await extractOfficialCalendarDraft({
        data: {
          academicYearId,
          semesterId,
          variantCode,
          fileBase64: base64,
          declaredMime: file.type || undefined,
          declaredName: file.name,
        },
      });
      setDraft(result);
      setOpen(false);
      toast.success("تم استخراج المسودة. راجع النتائج قبل الاعتماد.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذر استخراج التقويم");
    } finally {
      setExtracting(false);
    }
  };

  const editItem = (clientId: string, patch: Partial<CalendarImportDraftItem>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => {
        if (item.clientId !== clientId) return item;
        if (patch.selected !== undefined && Object.keys(patch).length === 1) {
          return { ...item, selected: patch.selected && item.status === "ready" };
        }
        const evaluated = reevaluateEditedImportItem(
          { ...item, ...patch },
          { semesterStart: draft.semesterStart, semesterEnd: draft.semesterEnd },
        );
        return {
          ...evaluated,
          selected: evaluated.status === "ready",
        };
      }),
    });
  };

  const removeItem = (clientId: string) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((item) => item.clientId !== clientId) });
  };

  const addManual = () => {
    if (!draft) return;
    setDraft({ ...draft, items: [...draft.items, emptyManualImportItem()] });
  };

  const selectAllReady = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => ({
        ...item,
        selected: item.status === "ready",
      })),
    });
  };

  const onApprove = async () => {
    if (!draft) return;
    const selected = draft.items.filter((item) => item.selected && item.status === "ready");
    if (selected.length === 0) {
      toast.error("لا توجد عناصر جاهزة للاعتماد. راجع العناصر أولًا.");
      return;
    }
    setApproving(true);
    try {
      const result = await approveOfficialCalendarImport({
        data: {
          academicYearId: draft.academicYearId,
          semesterId: draft.semesterId,
          variantCode: draft.variantCode,
          items: selected.map((item) => ({
            kind: item.kind as CalendarExceptionKind,
            title: item.title,
            startDate: item.startDate,
            endDate: item.endDate,
            selected: true,
          })),
        },
      });
      const parts = [`تم حفظ ${result.insertedCount} استثناء.`];
      if (result.duplicateCount > 0) {
        parts.push(`${result.duplicateCount} موجود مسبقًا ولم يُعدَّل.`);
      }
      if (result.rejectedCount > 0) {
        parts.push(`${result.rejectedCount} لم يُحفظ ويحتاج مراجعة.`);
      }
      toast.success(parts.join(" "));
      if (result.duplicates[0]) {
        toast.message(result.duplicates[0].message);
      }
      setDraft(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذر اعتماد التقويم");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground leading-relaxed">
          سياق الاستيراد:{" "}
          <span className="font-bold text-slate-800" data-testid="import-variant-context">
            {selectedVariantLabel}
          </span>
          {" · "}
          اختر التقويم من داخل بطاقة السنة الدراسية.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px] w-full sm:w-auto text-xs font-bold gap-1.5"
          onClick={() => void openDialog()}
        >
          <FileUp className="h-3.5 w-3.5" />
          استيراد من PDF / صورة
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>استيراد التقويم الرسمي</DialogTitle>
            <DialogDescription>
              ارفع ملف PDF أو صورة. سيُستخرج مسودة للمراجعة ولن يُحفظ شيء قبل اعتمادك.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">العام الدراسي</Label>
              <select
                className="h-11 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
              >
                <option value="">اختر العام الدراسي</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الفصل</Label>
              <select
                className="h-11 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                disabled={!academicYearId || loadingSemesters}
              >
                <option value="">اختر الفصل الدراسي</option>
                {semesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold" htmlFor="admin-import-calendar-variant">
                التقويم
              </Label>
              <select
                id="admin-import-calendar-variant"
                className="h-11 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={variantCode}
                onChange={(e) => onVariantChange(e.target.value)}
              >
                {variantOptions.map((variant) => (
                  <option key={variant.code} value={variant.code}>
                    {variant.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold" htmlFor="calendar-import-file">
                الملف
              </Label>
              <Input
                id="calendar-import-file"
                type="file"
                accept={FILE_ACCEPT}
                className="h-11 min-h-[44px] pt-2"
                disabled={extracting || !academicYearId || !semesterId}
                onChange={(e) => void onPickFile(e)}
              />
              <p className="text-[11px] text-muted-foreground">
                PDF أو JPG أو JPEG أو PNG. بحد أقصى 10 ميجابايت. لا يُحفظ الملف بعد الاستخراج.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 min-h-[44px]"
              onClick={() => setOpen(false)}
              disabled={extracting}
            >
              إلغاء
            </Button>
            <p className="text-xs text-muted-foreground self-center">
              {extracting ? "جارٍ الاستخراج…" : "اختر ملفًا للبدء"}
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {draft ? (
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-800">مراجعة التقويم المستورد</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                لن يُحفظ شيء في قاعدة البيانات حتى تعتمد العناصر الجاهزة.
              </p>
            </div>

            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <dt className="text-muted-foreground">العام الدراسي</dt>
                <dd className="mt-1 font-bold">{draft.academicYearLabel}</dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <dt className="text-muted-foreground">الفصل</dt>
                <dd className="mt-1 font-bold">{draft.semesterLabel}</dd>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <dt className="text-muted-foreground">التقويم</dt>
                <dd className="mt-1 font-bold">{draft.variantLabel}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-[44px] text-xs font-bold"
                onClick={selectAllReady}
              >
                تحديد الجاهز
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-[44px] text-xs font-bold gap-1.5"
                onClick={addManual}
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة عنصر
              </Button>
            </div>

            <ul className="space-y-3">
              {draft.items.map((item) => (
                <li
                  key={item.clientId}
                  className="rounded-xl border border-slate-100 p-3 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-[44px] items-center gap-2 text-xs font-bold">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={item.selected}
                        disabled={item.status !== "ready"}
                        onChange={(e) => editItem(item.clientId, { selected: e.target.checked })}
                      />
                      اعتماد
                    </label>
                    <Badge variant={item.status === "ready" ? "default" : "secondary"}>
                      {statusLabel(item.status)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      الثقة {confidencePct(item.confidence)}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">النوع</Label>
                      <select
                        className="h-11 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={item.kind}
                        onChange={(e) =>
                          editItem(item.clientId, {
                            kind: e.target.value as CalendarExceptionKind,
                          })
                        }
                      >
                        <option value="">اختر النوع</option>
                        {CALENDAR_EXCEPTION_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {CALENDAR_IMPORT_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">الاسم</Label>
                      <Input
                        className="h-11"
                        value={item.title}
                        onChange={(e) => editItem(item.clientId, { title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">من</Label>
                      <Input
                        type="date"
                        className="h-11"
                        value={item.startDate}
                        onChange={(e) => editItem(item.clientId, { startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">إلى</Label>
                      <Input
                        type="date"
                        className="h-11"
                        value={item.endDate}
                        onChange={(e) => editItem(item.clientId, { endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {item.reviewReason ||
                        `${formatDisplayDate(item.startDate)} → ${formatDisplayDate(item.endDate)}`}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 min-h-[44px] text-xs text-destructive gap-1.5"
                      onClick={() => removeItem(item.clientId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {draft.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لا توجد عناصر. أضف عنصرًا يدويًا أو ارفع ملفًا آخر.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-11 min-h-[44px] font-bold text-xs"
                disabled={approving}
                onClick={() => void onApprove()}
              >
                {approving ? "جارٍ الحفظ…" : "اعتماد الكل الجاهز"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 min-h-[44px] text-xs"
                onClick={() => setDraft(null)}
                disabled={approving}
              >
                إلغاء المسودة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
