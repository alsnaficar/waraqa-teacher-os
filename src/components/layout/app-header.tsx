import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/shared/ui/button";
import { SidebarTrigger } from "@/shared/ui/sidebar";
import { BackButton } from "@/shared/components/back-button";
import { supabase } from "@/platform/database/supabase/client";

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
    <header className="sticky top-0 z-30 flex h-11 items-center justify-between border-b border-white/30 dark:border-white/10 bg-white/75 dark:bg-zinc-950/75 px-3 backdrop-blur-md shadow-sm transform-gpu will-change-[transform,backdrop-filter]">
      <div className="flex items-center gap-0">
        <SidebarTrigger className="h-6 w-6" />
        {showBack ? <BackButton showText={false} className="-ml-1" /> : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="الإشعارات"
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="تسجيل الخروج"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
