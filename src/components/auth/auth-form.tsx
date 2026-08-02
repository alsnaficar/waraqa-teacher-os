import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Mail, ArrowLeft, CheckCircle2, Lock, User, Chrome } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { supabase, isSupabaseConfigured } from "@/platform/database/supabase/client";
import { ar } from "@/i18n/ar";
import { BrandLogo } from "@/components/layout/brand-logo";

export function AuthForm({
  onSuccess,
  defaultMode = "signin",
}: {
  onSuccess?: () => void;
  defaultMode?: "signin" | "signup";
} = {}) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(
          "تعذر الاتصال بقاعدة البيانات. يرجى إعداد متغيرات بيئة Supabase المطلوبة في إعدادات AI Studio Secrets أولاً.",
        );
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح");
        setRegisteredEmail(email);
        setSignupSuccess(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("مرحباً بعودتك");
        if (onSuccess) {
          onSuccess();
        }
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!isSupabaseConfigured()) {
      toast.error("تعذر الاتصال بقاعدة البيانات.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast.error("تعذّر تسجيل الدخول عبر Google");
      setLoading(false);
    }
  }

  if (signupSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center text-center space-y-6"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-teal-500/10 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-teal-500/10 text-teal-600 dark:text-teal-400 p-4 rounded-full border border-teal-500/20">
            <Mail className="h-12 w-12" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-teal-500 text-white p-1 rounded-full border-2 border-white dark:border-zinc-900">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            تأكيد الحساب مطلوب
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm">
            تم إنشاء حسابك بنجاح! لقد أرسلنا رسالة تأكيد إلى بريدك الإلكتروني:
          </p>
          <div className="bg-zinc-100 dark:bg-zinc-800/50 px-4 py-2 rounded-xl font-mono text-xs text-zinc-800 dark:text-zinc-200 select-all break-all border border-zinc-200 dark:border-zinc-700/50 mt-2">
            {registeredEmail}
          </div>
        </div>

        <div className="space-y-4 w-full pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full h-14 rounded-2xl gap-2 font-medium bg-white/50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700/50 transition-all"
            onClick={() => {
              setSignupSuccess(false);
              setMode("signin");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>العودة لتسجيل الدخول</span>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link
        to="/"
        aria-label="العودة إلى الصفحة الرئيسية"
        className="mt-2 mb-4 flex justify-center w-full hover:scale-[1.03] hover:opacity-90 transition-all duration-200 cursor-pointer"
      >
        <BrandLogo size="lg" className="mx-auto" />
      </Link>

      <div className="text-center mb-4 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
          {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {mode === "signin"
            ? "مرحبًا بعودتك، سجّل الدخول لمتابعة إدارة مناهجك وتحضير دروسك."
            : "ابدأ رحلتك معنا اليوم وقم بإدارة مناهجك بكل سهولة."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-2">
        <div className="space-y-2">
          {mode === "signup" && (
            <div className="relative group">
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-zinc-400 group-focus-within:text-teal-500 transition-colors">
                <User className="h-5 w-5" />
              </div>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="الاسم الكامل"
                required
                className="w-full h-12 bg-white/40 dark:bg-zinc-800/40 backdrop-blur-md border border-white/40 dark:border-zinc-700/40 rounded-2xl pr-12 pl-4 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all shadow-sm"
              />
            </div>
          )}

          <div className="relative group">
            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-zinc-400 group-focus-within:text-teal-500 transition-colors">
              <Mail className="h-5 w-5" />
            </div>
            <input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              required
              className="w-full h-12 bg-white/40 dark:bg-zinc-800/40 backdrop-blur-md border border-white/40 dark:border-zinc-700/40 rounded-2xl pr-12 pl-4 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all shadow-sm text-left"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-zinc-400 group-focus-within:text-teal-500 transition-colors">
              <Lock className="h-5 w-5" />
            </div>
            <input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              required
              minLength={6}
              className="w-full h-12 bg-white/40 dark:bg-zinc-800/40 backdrop-blur-md border border-white/40 dark:border-zinc-700/40 rounded-2xl pr-12 pl-4 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all shadow-sm text-left"
            />
          </div>
        </div>

        {mode === "signin" && (
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors hover:underline underline-offset-4"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-2xl text-base font-medium text-white shadow-[0_8px_24px_0_rgba(15,118,110,0.25)] hover:shadow-[0_12px_28px_rgba(15,118,110,0.35)] hover:-translate-y-[2px] transition-all duration-300 bg-gradient-to-r from-teal-600 to-emerald-500 border border-white/20 dark:border-white/10 mt-2"
        >
          {mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول"}
        </Button>
      </form>

      <div className="relative flex items-center w-full my-3">
        <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800/60" />
        <span className="flex-shrink-0 mx-4 text-xs font-medium text-zinc-400 dark:text-zinc-500">
          أو
        </span>
        <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800/60" />
      </div>

      <Button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        variant="outline"
        className="w-full h-12 rounded-2xl font-medium bg-white/40 dark:bg-zinc-800/30 backdrop-blur-md hover:bg-white/60 dark:hover:bg-zinc-800/50 border border-white/50 dark:border-zinc-700/50 hover:-translate-y-[1px] transition-all duration-300 shadow-sm flex items-center justify-center gap-3"
      >
        <Chrome className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
        <span>المتابعة باستخدام Google</span>
      </Button>

      <div className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
        {mode === "signin" ? (
          <>
            ليس لديك حساب؟{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              إنشاء حساب
            </button>
          </>
        ) : (
          <>
            لديك حساب بالفعل؟{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              تسجيل الدخول
            </button>
          </>
        )}
      </div>
    </div>
  );
}
