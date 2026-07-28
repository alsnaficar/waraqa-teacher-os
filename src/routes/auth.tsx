import { createFileRoute, Link } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth/auth-form";
import { BackButton } from "@/components/common/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { ar } from "@/i18n/ar";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "الدخول | ورقة" },
      { name: "description", content: "سجّل الدخول أو أنشئ حساباً في منصة ورقة للمعلمين." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="min-h-[100dvh] bg-background gradient-hero px-4 py-12 sm:py-20 flex flex-col items-center">
      <div className="w-full max-w-md shrink-0">
        <div className="mb-2 flex justify-start">
          <BackButton />
        </div>

        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
            و
          </div>
          <div className="text-center">
            <p className="text-lg font-bold leading-tight">{ar.app.name}</p>
            <p className="text-xs text-muted-foreground">{ar.app.tagline}</p>
          </div>
        </Link>
        <Card>
          <CardContent className="p-6">
            <AuthForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
