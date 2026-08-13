import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Pencil, Plus } from "lucide-react";

import { SectionHeader } from "@/shared/components/section-header";
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
import { formatHijri } from "@/shared/utils/date";
import {
  activateAdminAcademicYear,
  createAdminAcademicYear,
  createAdminSemester,
  listAdminAcademicYears,
  listAdminSemesters,
  updateAdminAcademicYear,
  updateAdminSemester,
} from "@/platform/calendar/academic-calendar.functions";

export const Route = createFileRoute("/_authenticated/admin/academic-calendar")({
  component: AdminAcademicCalendarPage,
});

type YearRow = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type SemesterRow = {
  id: string;
  academicYearId: string;
  label: string;
  startDate: string;
  endDate: string;
  orderIndex: number;
};

const emptyYearForm = {
  label: "",
  startDate: "",
  endDate: "",
  activate: true,
};
const emptySemesterForm = { label: "", startDate: "", endDate: "", orderIndex: 0 };

function hijriHint(iso: string): string {
  if (!iso) return "";
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatHijri(parsed);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function semesterCoversToday(sem: SemesterRow): boolean {
  const today = todayIso();
  if (!sem.startDate || !sem.endDate) return false;
  return sem.startDate <= today && today <= sem.endDate;
}

function AdminAcademicCalendarPage() {
  const [years, setYears] = useState<YearRow[]>([]);
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingYear, setSavingYear] = useState(false);
  const [savingSemester, setSavingSemester] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [showYearForm, setShowYearForm] = useState(false);
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [yearForm, setYearForm] = useState(emptyYearForm);
  const [semesterForm, setSemesterForm] = useState(emptySemesterForm);
  const [editingYear, setEditingYear] = useState<YearRow | null>(null);
  const [editingSemester, setEditingSemester] = useState<SemesterRow | null>(null);
  const [yearEditForm, setYearEditForm] = useState({
    label: "",
    startDate: "",
    endDate: "",
    isActive: false,
  });
  const [semesterEditForm, setSemesterEditForm] = useState({
    label: "",
    startDate: "",
    endDate: "",
    orderIndex: 0,
  });
  const [savingYearEdit, setSavingYearEdit] = useState(false);
  const [savingSemesterEdit, setSavingSemesterEdit] = useState(false);

  const selectedYear = years.find((y) => y.id === selectedYearId) ?? null;

  const loadYears = useCallback(async () => {
    const rows = await listAdminAcademicYears();
    setYears(rows);
    setSelectedYearId((prev) => {
      if (prev && rows.some((y) => y.id === prev)) return prev;
      const active = rows.find((y) => y.isActive);
      return active?.id ?? rows[0]?.id ?? null;
    });
  }, []);

  const loadSemesters = useCallback(async (yearId: string) => {
    const rows = await listAdminSemesters({ data: { academicYearId: yearId } });
    setSemesters(rows);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadYears();
      } catch (err) {
        console.error(err);
        if (active) toast.error("تعذّر تحميل السنوات الدراسية");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadYears]);

  useEffect(() => {
    if (!selectedYearId) {
      setSemesters([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        await loadSemesters(selectedYearId);
      } catch (err) {
        console.error(err);
        if (active) {
          setSemesters([]);
          toast.error("تعذّر تحميل الفصول الدراسية");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedYearId, loadSemesters]);

  const onCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearForm.label.trim() || !yearForm.startDate || !yearForm.endDate) {
      toast.error("أدخل الاسم وتاريخ البداية والنهاية");
      return;
    }
    if (yearForm.startDate > yearForm.endDate) {
      toast.error("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    setSavingYear(true);
    try {
      const created = await createAdminAcademicYear({
        data: {
          label: yearForm.label.trim(),
          startDate: yearForm.startDate,
          endDate: yearForm.endDate,
          activate: yearForm.activate,
        },
      });
      toast.success("تم إنشاء السنة الدراسية");
      setYearForm(emptyYearForm);
      setShowYearForm(false);
      await loadYears();
      setSelectedYearId(created.id);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء السنة الدراسية");
    } finally {
      setSavingYear(false);
    }
  };

  const onActivateYear = async (yearId: string) => {
    setActivatingId(yearId);
    try {
      await activateAdminAcademicYear({ data: { academicYearId: yearId } });
      toast.success("تم تفعيل السنة الدراسية");
      await loadYears();
      setSelectedYearId(yearId);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذّر تفعيل السنة");
    } finally {
      setActivatingId(null);
    }
  };

  const onCreateSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;
    if (!semesterForm.label.trim() || !semesterForm.startDate || !semesterForm.endDate) {
      toast.error("أدخل الاسم وتاريخ البداية والنهاية");
      return;
    }
    if (semesterForm.startDate > semesterForm.endDate) {
      toast.error("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    if (
      selectedYear &&
      (semesterForm.startDate < selectedYear.startDate ||
        semesterForm.endDate > selectedYear.endDate)
    ) {
      toast.error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية");
      return;
    }
    setSavingSemester(true);
    try {
      await createAdminSemester({
        data: {
          academicYearId: selectedYearId,
          label: semesterForm.label.trim(),
          startDate: semesterForm.startDate,
          endDate: semesterForm.endDate,
        },
      });
      toast.success("تم إنشاء الفصل الدراسي");
      setSemesterForm(emptySemesterForm);
      setShowSemesterForm(false);
      await loadSemesters(selectedYearId);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الفصل الدراسي");
    } finally {
      setSavingSemester(false);
    }
  };

  const openYearEdit = (year: YearRow) => {
    setEditingYear(year);
    setYearEditForm({
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
      isActive: year.isActive,
    });
  };

  const openSemesterEdit = (sem: SemesterRow) => {
    setEditingSemester(sem);
    setSemesterEditForm({
      label: sem.label,
      startDate: sem.startDate,
      endDate: sem.endDate,
      orderIndex: sem.orderIndex,
    });
  };

  const onSaveYearEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingYear) return;
    if (!yearEditForm.label.trim() || !yearEditForm.startDate || !yearEditForm.endDate) {
      toast.error("أدخل الاسم وتاريخ البداية والنهاية");
      return;
    }
    if (yearEditForm.startDate > yearEditForm.endDate) {
      toast.error("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    if (
      yearEditForm.startDate !== editingYear.startDate ||
      yearEditForm.endDate !== editingYear.endDate
    ) {
      const confirmed = window.confirm(
        "سيتم تغيير تواريخ السنة الدراسية. الحصص المرتبطة تبقى على نفس السنة. هل تريد حفظ التعديلات؟",
      );
      if (!confirmed) return;
    }
    setSavingYearEdit(true);
    try {
      const updated = await updateAdminAcademicYear({
        data: {
          academicYearId: editingYear.id,
          label: yearEditForm.label.trim(),
          startDate: yearEditForm.startDate,
          endDate: yearEditForm.endDate,
          isActive: yearEditForm.isActive,
        },
      });
      toast.success("تم حفظ تعديل السنة الدراسية");
      setEditingYear(null);
      await loadYears();
      setSelectedYearId(updated.id);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ تعديل السنة");
    } finally {
      setSavingYearEdit(false);
    }
  };

  const onSaveSemesterEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSemester) return;
    if (
      !semesterEditForm.label.trim() ||
      !semesterEditForm.startDate ||
      !semesterEditForm.endDate
    ) {
      toast.error("أدخل الاسم وتاريخ البداية والنهاية");
      return;
    }
    if (semesterEditForm.startDate > semesterEditForm.endDate) {
      toast.error("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    if (
      selectedYear &&
      (semesterEditForm.startDate < selectedYear.startDate ||
        semesterEditForm.endDate > selectedYear.endDate)
    ) {
      toast.error("فترة الفصل يجب أن تكون ضمن حدود السنة الدراسية");
      return;
    }
    if (
      semesterEditForm.startDate !== editingSemester.startDate ||
      semesterEditForm.endDate !== editingSemester.endDate
    ) {
      const confirmed = window.confirm(
        "سيتم تغيير تواريخ الفصل الدراسي. الحصص المرتبطة تبقى على نفس الفصل. هل تريد حفظ التعديلات؟",
      );
      if (!confirmed) return;
    }
    setSavingSemesterEdit(true);
    try {
      await updateAdminSemester({
        data: {
          semesterId: editingSemester.id,
          academicYearId: editingSemester.academicYearId,
          label: semesterEditForm.label.trim(),
          startDate: semesterEditForm.startDate,
          endDate: semesterEditForm.endDate,
          orderIndex: semesterEditForm.orderIndex,
        },
      });
      toast.success("تم حفظ تعديل الفصل الدراسي");
      setEditingSemester(null);
      if (selectedYearId) await loadSemesters(selectedYearId);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ تعديل الفصل");
    } finally {
      setSavingSemesterEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="التقويم الدراسي"
        description="إنشاء وتعديل وتفعيل السنة الدراسية الرسمية وفصولها. المعلمون لا يديرون هذا التقويم. التواريخ تُحفظ بالميلادي."
      />

      <Card className="shadow-sm border-slate-100">
        <CardContent className="p-4 sm:p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              السنوات الدراسية
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              فعّل سنة واحدة فقط لتكون السنة الحالية. التواريخ تُحفظ بالميلادي.
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">جارٍ التحميل…</p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-700">قائمة السنوات</h3>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-h-[44px] text-xs font-bold gap-1.5"
                    onClick={() => setShowYearForm((v) => !v)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة سنة دراسية
                  </Button>
                </div>

                {showYearForm && (
                  <form
                    onSubmit={onCreateYear}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 grid gap-3 sm:grid-cols-2"
                  >
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs font-bold">الاسم</Label>
                      <Input
                        className="h-11"
                        value={yearForm.label}
                        onChange={(e) => setYearForm((f) => ({ ...f, label: e.target.value }))}
                        placeholder="مثلاً: العام الدراسي 1448هـ - 1449هـ"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">تاريخ البداية (ميلادي)</Label>
                      <Input
                        type="date"
                        className="h-11"
                        value={yearForm.startDate}
                        onChange={(e) => setYearForm((f) => ({ ...f, startDate: e.target.value }))}
                        required
                      />
                      {yearForm.startDate ? (
                        <p className="text-[11px] text-muted-foreground">
                          الهجري: {hijriHint(yearForm.startDate)}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">تاريخ النهاية (ميلادي)</Label>
                      <Input
                        type="date"
                        className="h-11"
                        value={yearForm.endDate}
                        onChange={(e) => setYearForm((f) => ({ ...f, endDate: e.target.value }))}
                        required
                      />
                      {yearForm.endDate ? (
                        <p className="text-[11px] text-muted-foreground">
                          الهجري: {hijriHint(yearForm.endDate)}
                        </p>
                      ) : null}
                    </div>
                    <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 min-h-[44px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={yearForm.activate}
                        onChange={(e) => setYearForm((f) => ({ ...f, activate: e.target.checked }))}
                      />
                      تفعيل هذه السنة بعد الإنشاء
                    </label>
                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        disabled={savingYear}
                        className="h-11 font-bold text-xs"
                      >
                        {savingYear ? "جارٍ الحفظ…" : "حفظ السنة"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 text-xs"
                        onClick={() => setShowYearForm(false)}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </form>
                )}

                {years.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50">
                    <p className="text-xs text-slate-500 font-bold">لا توجد سنوات دراسية بعد.</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      أضف سنة دراسية أولاً لإضافة الفصول الدراسية.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {years.map((year) => {
                      const selected = year.id === selectedYearId;
                      return (
                        <li
                          key={year.id}
                          className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                            selected
                              ? "border-primary/30 bg-primary/5"
                              : "border-slate-100 bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex-1 text-start min-h-[44px] space-y-0.5"
                            onClick={() => setSelectedYearId(year.id)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{year.label}</span>
                              {year.isActive && (
                                <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                  نشطة
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {year.startDate || "—"} → {year.endDate || "—"}
                            </p>
                            {year.startDate || year.endDate ? (
                              <p className="text-[11px] text-muted-foreground">
                                هجري: {hijriHint(year.startDate) || "—"} →{" "}
                                {hijriHint(year.endDate) || "—"}
                              </p>
                            ) : null}
                          </button>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 min-h-[44px] text-xs font-bold gap-1.5"
                              onClick={() => openYearEdit(year)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              تعديل
                            </Button>
                            {!year.isActive && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 min-h-[44px] text-xs font-bold"
                                disabled={activatingId === year.id}
                                onClick={() => onActivateYear(year.id)}
                              >
                                {activatingId === year.id ? "جارٍ التفعيل…" : "تفعيل"}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-700">الفصول الدراسية</h3>
                  {selectedYearId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-h-[44px] text-xs font-bold gap-1.5"
                      onClick={() => setShowSemesterForm((v) => !v)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة فصل
                    </Button>
                  )}
                </div>

                {!selectedYearId ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50">
                    <p className="text-xs text-slate-500 font-bold">
                      أضف سنة دراسية أولاً لإضافة الفصول الدراسية.
                    </p>
                  </div>
                ) : (
                  <>
                    {showSemesterForm && (
                      <form
                        onSubmit={onCreateSemester}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 grid gap-3 sm:grid-cols-2"
                      >
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs font-bold">الاسم</Label>
                          <Input
                            className="h-11"
                            value={semesterForm.label}
                            onChange={(e) =>
                              setSemesterForm((f) => ({ ...f, label: e.target.value }))
                            }
                            placeholder="مثلاً: الفصل الأول"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">تاريخ البداية (ميلادي)</Label>
                          <Input
                            type="date"
                            className="h-11"
                            value={semesterForm.startDate}
                            onChange={(e) =>
                              setSemesterForm((f) => ({ ...f, startDate: e.target.value }))
                            }
                            required
                          />
                          {semesterForm.startDate ? (
                            <p className="text-[11px] text-muted-foreground">
                              الهجري: {hijriHint(semesterForm.startDate)}
                            </p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">تاريخ النهاية (ميلادي)</Label>
                          <Input
                            type="date"
                            className="h-11"
                            value={semesterForm.endDate}
                            onChange={(e) =>
                              setSemesterForm((f) => ({ ...f, endDate: e.target.value }))
                            }
                            required
                          />
                          {semesterForm.endDate ? (
                            <p className="text-[11px] text-muted-foreground">
                              الهجري: {hijriHint(semesterForm.endDate)}
                            </p>
                          ) : null}
                        </div>
                        {selectedYear && (
                          <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                            ضمن سنة {selectedYear.label}: {selectedYear.startDate} →{" "}
                            {selectedYear.endDate}
                          </p>
                        )}
                        <div className="sm:col-span-2 flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            disabled={savingSemester}
                            className="h-11 font-bold text-xs"
                          >
                            {savingSemester ? "جارٍ الحفظ…" : "حفظ الفصل"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11 text-xs"
                            onClick={() => setShowSemesterForm(false)}
                          >
                            إلغاء
                          </Button>
                        </div>
                      </form>
                    )}

                    {semesters.length === 0 ? (
                      <p className="text-xs text-slate-500">لا توجد فصول لهذه السنة بعد.</p>
                    ) : (
                      <ul className="space-y-2">
                        {semesters.map((sem) => {
                          const current = semesterCoversToday(sem);
                          return (
                            <li
                              key={sem.id}
                              className="rounded-xl border border-slate-100 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                            >
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-slate-800">
                                    {sem.label}
                                  </span>
                                  {current && (
                                    <Badge className="text-[10px] font-bold bg-sky-100 text-sky-800 hover:bg-sky-100">
                                      الحالي حسب التاريخ
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {sem.startDate || "—"} → {sem.endDate || "—"} · الترتيب:{" "}
                                  {sem.orderIndex}
                                </p>
                                {sem.startDate || sem.endDate ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    هجري: {hijriHint(sem.startDate) || "—"} →{" "}
                                    {hijriHint(sem.endDate) || "—"}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 min-h-[44px] text-xs font-bold gap-1.5 shrink-0"
                                onClick={() => openSemesterEdit(sem)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                تعديل
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingYear)} onOpenChange={(open) => !open && setEditingYear(null)}>
        <DialogContent className="text-start">
          <DialogHeader>
            <DialogTitle>تعديل السنة الدراسية</DialogTitle>
            <DialogDescription>
              عدّل الاسم وتاريخ البداية والنهاية للصف الحالي فقط. أدخل التواريخ الرسمية الصادرة من
              وزارة التعليم يدويًا. المعرّف لا يتغير.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveYearEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-bold">الاسم</Label>
              <Input
                className="h-11"
                value={yearEditForm.label}
                onChange={(e) => setYearEditForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="مثلاً: العام الدراسي 1448هـ - 1449هـ"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">تاريخ البداية</Label>
              <Input
                type="date"
                className="h-11"
                value={yearEditForm.startDate}
                onChange={(e) => setYearEditForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
              {yearEditForm.startDate ? (
                <p className="text-[11px] text-muted-foreground">
                  الهجري: {hijriHint(yearEditForm.startDate)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">تاريخ النهاية</Label>
              <Input
                type="date"
                className="h-11"
                value={yearEditForm.endDate}
                onChange={(e) => setYearEditForm((f) => ({ ...f, endDate: e.target.value }))}
                required
              />
              {yearEditForm.endDate ? (
                <p className="text-[11px] text-muted-foreground">
                  الهجري: {hijriHint(yearEditForm.endDate)}
                </p>
              ) : null}
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 min-h-[44px]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={yearEditForm.isActive}
                onChange={(e) => setYearEditForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              سنة نشطة (سنة واحدة فقط تكون نشطة)
            </label>
            <DialogFooter className="sm:col-span-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={savingYearEdit} className="h-11 font-bold text-xs">
                {savingYearEdit ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-xs"
                onClick={() => setEditingYear(null)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingSemester)}
        onOpenChange={(open) => !open && setEditingSemester(null)}
      >
        <DialogContent className="text-start">
          <DialogHeader>
            <DialogTitle>تعديل الفصل الدراسي</DialogTitle>
            <DialogDescription>
              عدّل الاسم وتاريخ البداية والنهاية للصف الحالي فقط. أدخل التواريخ الرسمية الصادرة من
              وزارة التعليم يدويًا. المعرّف لا يتغير.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveSemesterEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-bold">الاسم</Label>
              <Input
                className="h-11"
                value={semesterEditForm.label}
                onChange={(e) => setSemesterEditForm((f) => ({ ...f, label: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">تاريخ البداية</Label>
              <Input
                type="date"
                className="h-11"
                value={semesterEditForm.startDate}
                onChange={(e) => setSemesterEditForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
              {semesterEditForm.startDate ? (
                <p className="text-[11px] text-muted-foreground">
                  الهجري: {hijriHint(semesterEditForm.startDate)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">تاريخ النهاية</Label>
              <Input
                type="date"
                className="h-11"
                value={semesterEditForm.endDate}
                onChange={(e) => setSemesterEditForm((f) => ({ ...f, endDate: e.target.value }))}
                required
              />
              {semesterEditForm.endDate ? (
                <p className="text-[11px] text-muted-foreground">
                  الهجري: {hijriHint(semesterEditForm.endDate)}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-bold">الترتيب</Label>
              <Input
                type="number"
                min={0}
                max={20}
                className="h-11"
                value={semesterEditForm.orderIndex}
                onChange={(e) =>
                  setSemesterEditForm((f) => ({
                    ...f,
                    orderIndex: Number.parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
            <DialogFooter className="sm:col-span-2 flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={savingSemesterEdit}
                className="h-11 font-bold text-xs"
              >
                {savingSemesterEdit ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-xs"
                onClick={() => setEditingSemester(null)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
