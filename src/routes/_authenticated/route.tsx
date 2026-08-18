import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/platform/database/supabase/client";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useAcademicCalendar } from "@/platform/config/academic-config";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // Initiates database fetch of active year/semesters and populates cache
  useAcademicCalendar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isMadrasatiLogin = pathname === "/madrasati-login";

  // Admin routes render their own shell — do not wrap with teacher chrome.
  if (isAdminArea || isMadrasatiLogin) {
    return <Outlet />;
  }

  return (
    <>
      <AppHeader />
      <div className="authenticated-shell-offset flex-1 w-full min-h-0">
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
}
