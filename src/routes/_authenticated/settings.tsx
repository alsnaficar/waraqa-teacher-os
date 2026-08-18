import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/shared/components/section-header";
import { GradesClassesPanel } from "@/features/classes/components/grades-classes-panel";
import {
  previewMadrasatiSync,
  getMadrasatiAuthenticationStatus,
  getMadrasatiTeacherProfile,
  MADRASATI_DRY_RUN_DISCLAIMER,
  type MadrasatiDryRunPreviewResult,
  type MadrasatiAuthenticationStatusResult,
  type MadrasatiTeacherProfileResult,
} from "@/platform/integration/connectors/madrasati/madrasati.functions";
import { StudentsPanel } from "@/features/homework/components/students-panel";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { supabase } from "@/platform/database/supabase/client";
import { type EducationStage } from "@/features/ai/components/curriculum-selector";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

/** Shared assignment shape used by other routes; Settings no longer edits it. */
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
};

const EMPTY: ProfileForm = {
  full_name: "",
  avatar_url: "",
  locale: "ar",
  whatsapp: "",
};

function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<MadrasatiDryRunPreviewResult | null>(null);
  const [madrasatiStatus, setMadrasatiStatus] =
    useState<MadrasatiAuthenticationStatusResult | null>(null);
  const [teacherProfile, setTeacherProfile] =
    useState<MadrasatiTeacherProfileResult | null>(null);
  const previewFn = useServerFn(previewMadrasatiSync);
  const madrasatiStatusFn = useServerFn(getMadrasatiAuthenticationStatus);
  const teacherProfileFn = useServerFn(getMadrasatiTeacherProfile);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user || !active) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, locale, whatsapp")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;

      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          avatar_url: data.avatar_url ?? "",
          locale: data.locale ?? "ar",
          whatsapp: data.whatsapp ?? "",
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await madrasatiStatusFn();
        if (active) {
          setMadrasatiStatus(status);
        }
        if (status.authenticationState === "authenticated") {
          try {
            const teacher = await teacherProfileFn();
            if (active) {
              setTeacherProfile(teacher);
            }
          } catch {
            if (active) {
              setTeacherProfile(null);
            }
          }
        }
      } catch {
        if (active) {
          setMadrasatiStatus({
            hasSession: false,
            authenticationState: "not_authenticated",
          });
          setTeacherProfile(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [madrasatiStatusFn, teacherProfileFn]);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        locale: form.locale,
        whatsapp: form.whatsapp.trim() || null,
      })
      .eq("id", userId);

    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ التغييرات");
      return;
    }
    toast.success("تم حفظ التغييرات بنجاح");
  };

  const initials = (form.full_name || "?").trim().charAt(0).toUpperCase();

  return (
    <PageShell>
      <SectionHeader
        title="الإعدادات"
        description="حدّث بيانات ملفك الشخصي وأدر صفوفك وفصولك."
      />
      <div className="space-y-6">
        {/* Madrasati Integration Card — status only; no credential collection */}
        <Card className="shadow-sm border-amber-100 bg-amber-50/40">
          <CardContent className="p-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 shrink-0" />
                    مزامنة منصة مدرستي
                  </h3>
                  <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                    {madrasatiStatus?.authenticationState === "authenticated"
                      ? teacherProfile
                        ? `تم تسجيل الدخول إلى مدرستي باسم ${teacherProfile.displayName}${teacherProfile.schoolName ? ` — ${teacherProfile.schoolName}` : ""}`
                        : "تم تسجيل الدخول إلى مدرستي. جلسة المتصفح محفوظة على الخادم وجاهزة للمزامنة."
                      : madrasatiStatus?.hasSession
                        ? "جلسة تسجيل الدخول إلى مدرستي ما زالت مفتوحة على الخادم."
                        : `مزامنة مدرستي ستتم عبر المتصفح عند توفر المنصة. ${MADRASATI_DRY_RUN_DISCLAIMER}`}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 font-bold text-xs gap-2 shrink-0 border-amber-200 bg-white"
                >
                  <Link to="/madrasati-login">تسجيل الدخول إلى مدرستي</Link>
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-xs font-bold text-amber-900"
                disabled={previewLoading}
                onClick={() => {
                  void (async () => {
                    setPreviewLoading(true);
                    try {
                      setPreview(await previewFn());
                    } catch (error) {
                      const text =
                        error instanceof Error
                          ? error.message
                          : "تعذر تنفيذ معاينة مزامنة مدرستي.";
                      toast.error(text);
                    } finally {
                      setPreviewLoading(false);
                    }
                  })();
                }}
              >
                {previewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                معاينة مزامنة مدرستي
              </Button>

              {preview ? (
                <p className="text-xs leading-relaxed text-amber-900/80">
                  {preview.disclaimer} · اكتشف {preview.counts.discovered} · مقبول{" "}
                  {preview.timetable.accepted.length} · مرفوض {preview.counts.rejected}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <GradesClassesPanel />

        <StudentsPanel />

        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <form className="grid gap-6 sm:grid-cols-2" onSubmit={onSubmit}>
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

              <div className="sm:col-span-2 flex justify-end pt-2 border-t">
                <Button type="submit" disabled={loading || saving} className="h-11 font-bold">
                  {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

    </PageShell>
  );
}
