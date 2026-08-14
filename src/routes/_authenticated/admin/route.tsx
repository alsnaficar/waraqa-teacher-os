import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminAccess } from "@/platform/auth/admin-access.functions";
import { supabase } from "@/platform/database/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const user = context.user;
    if (!user?.id) {
      throw redirect({ to: "/auth", replace: true });
    }

    // Route UX gate (ssr:false + localStorage JWT): read OWN role via RLS.
    // This is the same client-auth model as /_authenticated getUser().
    // It is NOT the security boundary for data — requireAdminAccess is.
    const { data: adminRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || adminRow?.role !== "admin") {
      throw redirect({ to: "/dashboard", replace: true });
    }

    // Canonical server boundary: JWT → user_roles.role === 'admin' via assertAdmin.
    try {
      const access = await requireAdminAccess();
      return { adminAuthorized: true as const, adminUserId: access.userId };
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error("[admin] server access denied:", err instanceof Error ? err.message : err);
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  pendingComponent: AdminGatePending,
  component: AdminLayoutRoute,
});

function AdminGatePending() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 text-muted-foreground dark:bg-zinc-950">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm">جاري التحقق من صلاحيات الإدارة…</p>
    </div>
  );
}

function AdminLayoutRoute() {
  // Defense in depth: never paint Admin chrome unless beforeLoad authorized.
  const { adminAuthorized } = Route.useRouteContext();
  if (adminAuthorized !== true) {
    return null;
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
