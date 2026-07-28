import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ar } from "@/i18n/ar";

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
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
        className="flex flex-col items-center text-center space-y-6 py-4"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-primary/10 text-primary p-4 rounded-full border border-primary/20">
            <Mail className="h-12 w-12" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-full border-2 border-background">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">تأكيد الحساب مطلوب</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            تم إنشاء حسابك بنجاح! لقد أرسلنا رسالة تأكيد إلى بريدك الإلكتروني:
          </p>
          <div className="bg-muted px-4 py-2 rounded-lg font-mono text-xs text-foreground select-all break-all border border-border">
            {registeredEmail}
          </div>
        </div>

        <div className="space-y-4 w-full">
          <div className="text-right text-xs space-y-2.5 bg-primary/5 rounded-xl p-4 border border-primary/10 text-muted-foreground leading-relaxed">
            <p className="font-semibold text-primary text-sm mb-1">ما الخطوة التالية؟</p>
            <p className="flex items-start gap-1.5">
              <span className="text-primary font-bold">١.</span>
              <span>افتح صندوق الوارد في بريدك الإلكتروني.</span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-primary font-bold">٢.</span>
              <span>
                ابحث عن رسالة التفعيل المرسلة من منصة <strong>ورقة</strong>.
              </span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-primary font-bold">٣.</span>
              <span>اضغط على رابط التأكيد لتفعيل حسابك وتأكيده بالكامل.</span>
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
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
    <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">{ar.nav.signIn}</TabsTrigger>
        <TabsTrigger value="signup">{ar.nav.signUp}</TabsTrigger>
      </TabsList>

      <TabsContent value={mode} className="mt-6 space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          {ar.auth.google}
        </Button>

        <div className="relative flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>{ar.auth.or}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">{ar.auth.fullName}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">{ar.auth.email}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{ar.auth.password}</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {mode === "signup" ? ar.auth.submitSignUp : ar.auth.submitSignIn}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
