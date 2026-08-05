import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/shared/ui/button";
import { BackButton } from "@/shared/components/back-button";
import { supabase } from "@/platform/database/supabase/client";
import { BrandLogo } from "./brand-logo";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showBack = pathname !== "/dashboard";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("تعذّر تسجيل الخروج");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] md:h-[80px] lg:h-[88px] items-center justify-between border-b border-zinc-200/85 dark:border-zinc-800/85 bg-white/80 dark:bg-zinc-950/80 px-6 backdrop-blur-md shadow-sm transform-gpu transition-all duration-200 will-change-[transform,backdrop-filter]">
      <div className="flex items-center gap-4">
        {showBack ? <BackButton showText={false} className="me-1" /> : null}

        {/* Waraqa Official Logo in Header (Icon + Wordmark, size md, perfectly aligned and spaced) */}
        <Link to="/dashboard" className="flex items-center hover:opacity-90 transition-opacity">
          <BrandLogo size="md" />
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="الإشعارات"
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="تسجيل الخروج"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
