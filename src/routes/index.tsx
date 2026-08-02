import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/shared/ui/button";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ar } from "@/i18n/ar";
import { supabase } from "@/platform/database/supabase/client";

import { BookOpen, CalendarDays, Sparkles, Apple, X } from "lucide-react";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { z } from "zod";

const landingSearchSchema = z.object({
  login: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => landingSearchSchema.parse(search),
  component: Landing,
});

const features = [
  {
    icon: BookOpen,
    title: "إدارة المناهج",
    body: "نظم المناهج والوحدات والدروس في مكان واحد.",
  },
  {
    icon: CalendarDays,
    title: "التخطيط الأسبوعي",
    body: "أنشئ خطة أسبوعية مرتبطة بالمناهج.",
  },
  {
    icon: Sparkles,
    title: "الذكاء الاصطناعي",
    body: "أنشئ التحضير والاختبارات وأوراق العمل خلال ثوانٍ.",
  },
];

function Landing() {
  const { login } = Route.useSearch();
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(login === "true");
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsAuthModalOpen(login === "true");
  }, [login]);

  const handleCloseModal = () => {
    setIsAuthModalOpen(false);

    navigate({
      to: "/",
      search: {},
      replace: true,
    });
  };

  const handleOpenAuth = (mode: "signin" | "signup") => {
    setAuthModalMode(mode);

    setIsAuthModalOpen(true);

    navigate({
      to: "/",
      search: {
        login: "true",
      },
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-zinc-950">
      <LandingHeader
        authenticated={!!isAuthenticated}
        onSignIn={() => handleOpenAuth("signin")}
        onPricing={() => handleOpenAuth("signup")}
      />

      <LandingHero onPricing={() => handleOpenAuth("signup")} />

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature, index) => (
            <div key={index} className="rounded-3xl border bg-white p-8 dark:bg-zinc-900">
              <feature.icon className="mb-5 h-8 w-8 text-teal-600" />

              <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>

              <p className="text-zinc-600 dark:text-zinc-400">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>
      {/* App Download */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-3xl border bg-white p-10 text-center dark:bg-zinc-900">
          <h2 className="text-3xl font-bold">حمل تطبيق ورقة</h2>

          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            قريباً على App Store و Google Play.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#"
              className="flex h-14 w-52 items-center justify-center gap-3 rounded-xl bg-black text-white"
            >
              <Apple className="h-6 w-6" />

              <div className="text-right leading-tight">
                <div className="text-[10px]">Download on the</div>

                <div className="font-semibold">App Store</div>
              </div>
            </a>

            <a
              href="#"
              className="flex h-14 w-52 items-center justify-center rounded-xl bg-emerald-600 px-6 text-white"
            >
              Google Play
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-sm text-zinc-500">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <span>© 2026 ورقة</span>

          <a href="#">سياسة الخصوصية</a>

          <a href="#">الشروط والأحكام</a>

          <a href="#">تواصل معنا</a>
        </div>
      </footer>

      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-md rounded-3xl bg-white p-8 dark:bg-zinc-900"
            >
              <button onClick={handleCloseModal} className="absolute left-4 top-4">
                <X className="h-5 w-5" />
              </button>

              <AuthForm defaultMode={authModalMode} onSuccess={handleCloseModal} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
