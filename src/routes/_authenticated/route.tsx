import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
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

  return (
  <>
    <AppHeader />
    <div className="flex-1 pb-32 w-full min-h-0">
      <Outlet />
    </div>
    <BottomNav />
  </>
);
}

