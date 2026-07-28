import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, BookOpen, RefreshCw } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { MadrasatiAuthModal } from "@/platform/integration/connectors/madrasati/components/madrasati-auth-modal";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { supabase } from "@/platform/database/supabase/client";
import {
  STAGE_LABEL,
  GRADES_BY_STAGE,
  SUBJECTS_BY_STAGE,
  type EducationStage,
} from "@/features/ai/components/curriculum-selector";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

export interface Assignment {
  stage: EducationStage;
  grade: string;
  subject: string;
  klasses: string[];
}

type ProfileForm = {
  full_name: string;
  avatar_url: string;
  locale: string;
  whatsapp: string;
  assignments: Assignment[];
};

const EMPTY: ProfileForm = {
  full_name: "",
  avatar_url: "",
  locale: "ar",
  whatsapp: "",
  assignments: [],
};

function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [classesObj, setClassesObj] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [madrasatiModalOpen, setMadrasatiModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user || !active) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, locale, whatsapp, classes, subject, grade")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        const classes = (data.classes as Record<string, unknown>) || {};
        setClassesObj(classes);
        let loadedAssignments: Assignment[] = [];
        if (Array.isArray(classes.assignments)) {
          loadedAssignments = classes.assignments as Assignment[];
        } else if (data.subject || data.grade) {
          // fallback migration for existing profile
          const grade = data.grade || "";
          const subject = data.subject || "";
          const stage = grade.includes("متوسط")
            ? "intermediate"
            : grade.includes("ثانوي")
              ? "secondary"
              : "primary";
          loadedAssignments = [
            {
              stage,
              grade,
              subject,
              klasses: ["أ"], // default class name
            },
          ];
        }
        setForm({
          full_name: data.full_name ?? "",
          avatar_url: data.avatar_url ?? "",
          locale: data.locale ?? "ar",
          whatsapp: data.whatsapp ?? "",
          assignments: loadedAssignments,
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addAssignment = () => {
    setForm((f) => ({
      ...f,
      assignments: [
        ...f.assignments,
        {
          stage: "primary",
          grade: GRADES_BY_STAGE.primary[0],
          subject: SUBJECTS_BY_STAGE.primary[0],
          klasses: ["أ"],
        },
      ],
    }));
  };

  const removeAssignment = (index: number) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.filter((_, i) => i !== index),
    }));
  };

  const updateAssignment = (index: number, key: keyof Assignment, val: unknown) => {
    setForm((f) => {
      const updated = [...f.assignments];
      if (key === "stage") {
        const stageVal = val as EducationStage;
        updated[index] = {
          ...updated[index],
          stage: stageVal,
          grade: GRADES_BY_STAGE[stageVal][0],
          subject: SUBJECTS_BY_STAGE[stageVal][0],
        };
      } else {
        updated[index] = {
          ...updated[index],
          [key]: val,
        };
      }
      return { ...f, assignments: updated };
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);

    const firstAssignment = form.assignments[0];
    const updatedClasses = {
      ...classesObj,
      assignments: form.assignments,
      teacher_assignments: form.assignments,
    };

    let { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        locale: form.locale,
        whatsapp: form.whatsapp.trim() || null,
        classes: updatedClasses,
        subject: firstAssignment?.subject || null,
        grade: firstAssignment?.grade || null,
        teacher_assignments: form.assignments, // directly as requested
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .eq("id", userId);

    if (error) {
      console.warn("Retrying profile save without top-level teacher_assignments column:", error);
      const retryResult = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim() || null,
          avatar_url: form.avatar_url.trim() || null,
          locale: form.locale,
          whatsapp: form.whatsapp.trim() || null,
          classes: updatedClasses,
          subject: firstAssignment?.subject || null,
          grade: firstAssignment?.grade || null,
        })
        .eq("id", userId);
      error = retryResult.error;
    }

    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ التغييرات");
      return;
    }
    toast.success("تم حفظ الإسناد بنجاح");
  };

  const initials = (form.full_name || "?").trim().charAt(0).toUpperCase();

  return (
    <PageShell>
      <SectionHeader title="الإعدادات" description="حدّث بيانات ملفك الشخصي والإسناد الدراسي." />
      <div className="space-y-6">
        {/* Madrasati Integration Card */}
        <Card className="shadow-sm border-slate-100 bg-green-50/50">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-green-900 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  الربط الذكي مع منصة مدرستي
                </h3>
                <p className="text-xs text-green-700 mt-1">
                  يمكنك مزامنة حسابك مع منصة مدرستي لاستيراد جدول الحصص الأسبوعي والمنهج الدراسي
                  الرسمي تلقائياً.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setMadrasatiModalOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs gap-2 shrink-0"
              >
                <RefreshCw className="h-4 w-4" />
                ربط ومزامنة جدول مدرستي
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <form className="grid gap-6 sm:grid-cols-2" onSubmit={onSubmit}>
              {/* Profile details */}
              <div className="sm:col-span-2 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 border-b pb-2">البيانات الشخصية</h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
                  <Avatar className="h-16 w-16 border-2 border-slate-100 shadow-sm">
                    <AvatarImage src={form.avatar_url || undefined} alt="" />
                    <AvatarFallback className="bg-primary/5 text-primary font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 w-full space-y-1.5">
                    <Label htmlFor="avatar_url" className="text-xs font-bold text-slate-700">
                      رابط الصورة الرمزية
                    </Label>
                    <Input
                      id="avatar_url"
                      placeholder="https://…"
                      value={form.avatar_url}
                      onChange={(e) => set("avatar_url", e.target.value)}
                      disabled={loading}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="full_name" className="text-xs font-bold text-slate-700">
                      الاسم الكامل
                    </Label>
                    <Input
                      id="full_name"
                      placeholder="أدخل اسمك"
                      value={form.full_name}
                      onChange={(e) => set("full_name", e.target.value)}
                      maxLength={100}
                      disabled={loading}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="locale" className="text-xs font-bold text-slate-700">
                      اللغة
                    </Label>
                    <Select
                      value={form.locale}
                      onValueChange={(v) => set("locale", v)}
                      disabled={loading}
                    >
                      <SelectTrigger id="locale" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ar">العربية</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp" className="text-xs font-bold text-slate-700">
                      رقم الهاتف
                    </Label>
                    <Input
                      id="whatsapp"
                      type="tel"
                      placeholder="+9665…"
                      value={form.whatsapp}
                      onChange={(e) => set("whatsapp", e.target.value)}
                      maxLength={32}
                      disabled={loading}
                      className="h-10"
                    />
                  </div>
                </div>
              </div>

              {/* Assignments / Multi-subject & Multi-class assignments section */}
              <div className="sm:col-span-2 space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      الإسناد الدراسي (المواد والصفوف)
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      أضف المواد والصفوف وال فصول التي تقوم بتدريسها لبناء الخطة الدراسية المناسبة.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAssignment}
                    className="h-9 text-xs gap-1 font-bold border-dashed text-primary border-primary hover:bg-primary/5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة مادة/صف
                  </Button>
                </div>

                {form.assignments.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
                    <BookOpen className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-bold">
                      لم يتم إضافة أي إسناد دراسي بعد.
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      يرجى الضغط على الزر أعلاه لإضافة المادة والصف وتحديد الفصول التابعة لها.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {form.assignments.map((assignment, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 relative group"
                      >
                        <div className="absolute left-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAssignment(index)}
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="حذف الإسناد"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAssignment(index)}
                          className="absolute left-3 top-3 h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 sm:hidden"
                          title="حذف الإسناد"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>

                        <div className="grid gap-3 sm:grid-cols-4">
                          {/* Stage */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600">المرحلة</Label>
                            <Select
                              value={assignment.stage}
                              onValueChange={(v) => updateAssignment(index, "stage", v)}
                            >
                              <SelectTrigger className="h-9 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(STAGE_LABEL).map(([val, lbl]) => (
                                  <SelectItem key={val} value={val} className="text-xs">
                                    {lbl}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Grade */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600">الصف</Label>
                            <Select
                              key={`${index}-grade-${assignment.stage}`}
                              value={assignment.grade}
                              onValueChange={(v) => updateAssignment(index, "grade", v)}
                            >
                              <SelectTrigger className="h-9 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GRADES_BY_STAGE[assignment.stage]?.map((g) => (
                                  <SelectItem key={g} value={g} className="text-xs">
                                    {g}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Subject */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600">
                              المادة الدراسية
                            </Label>
                            <Select
                              key={`${index}-subject-${assignment.stage}`}
                              value={assignment.subject}
                              onValueChange={(v) => updateAssignment(index, "subject", v)}
                            >
                              <SelectTrigger className="h-9 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUBJECTS_BY_STAGE[assignment.stage]?.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Classes / Sections */}
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600">
                              الفصول المسندة
                            </Label>
                            <Input
                              placeholder="مثال: أ, ب, ج"
                              value={assignment.klasses?.join(", ") || ""}
                              onChange={(e) => {
                                const list = e.target.value
                                  .split(/[,،]/)
                                  .map((k) => k.trim())
                                  .filter(Boolean);
                                updateAssignment(index, "klasses", list);
                              }}
                              className="h-9 text-xs bg-white"
                            />
                            <div className="flex flex-wrap gap-1 mt-1">
                              {assignment.klasses?.map((k, kIdx) => (
                                <Badge
                                  key={kIdx}
                                  variant="secondary"
                                  className="text-[9px] px-1 py-0 scale-95 font-bold"
                                >
                                  {k}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2 border-t">
                <Button type="submit" disabled={loading || saving} className="font-bold">
                  {saving ? "جارٍ الحفظ…" : "حفظ التغييرات والأسناد"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <MadrasatiAuthModal
        open={madrasatiModalOpen}
        onOpenChange={setMadrasatiModalOpen}
        onSyncSuccess={async () => {
          window.location.reload();
        }}
      />
    </PageShell>
  );
}
