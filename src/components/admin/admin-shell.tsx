import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  CalendarDays,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  BookOpen,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/shared/ui/button";
import { supabase } from "@/platform/database/supabase/client";
import { cn } from "@/shared/utils/utils";

type AdminNavItem = {
  to:
    | "/admin"
    | "/admin/users"
    | "/admin/payments"
    | "/admin/curriculum-management"
    | "/admin/academic-calendar"
    | "/admin/google-sheets";
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact?: boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin", label: "لوحة التحكم", shortLabel: "اللوحة", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "المستخدمون", shortLabel: "المستخدمون", icon: Users },
  { to: "/admin/payments", label: "الدفعات", shortLabel: "الدفعات", icon: Banknote },
  { to: "/admin/curriculum-management", label: "المناهج", shortLabel: "المناهج", icon: BookOpen },
  {
    to: "/admin/academic-calendar",
    label: "التقويم الدراسي",
    shortLabel: "التقويم",
    icon: CalendarDays,
  },
  {
    to: "/admin/google-sheets",
    label: "Google Sheets",
    shortLabel: "Sheets",
    icon: FileSpreadsheet,
  },
];

function isActivePath(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("تعذّر تسجيل الخروج");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200/85 bg-white/90 backdrop-blur-md dark:border-zinc-800/85 dark:bg-zinc-950/90 [@media(max-height:500px)]:static">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6 [@media(max-height:500px)]:py-2">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:gap-3">
            <Link
              to="/admin"
              className="flex min-w-0 max-w-full items-center gap-2 hover:opacity-90"
              aria-label="لوحة إدارة ورقة"
            >
              <BrandLogo size="sm" />
            </Link>
            <span className="inline-flex max-w-full items-center gap-1.5 break-words rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-semibold leading-snug text-primary sm:px-2.5 sm:text-xs">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              إدارة النظام
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 min-h-[44px] whitespace-normal px-3 text-sm"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              <span className="lg:hidden">المعلم</span>
              <span className="hidden lg:inline">واجهة المعلم</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px]"
              aria-label="تسجيل الخروج"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <nav aria-label="تنقل الإدارة" className="border-t border-zinc-100 dark:border-zinc-900">
          <ul className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap gap-1 px-2 py-2 md:px-4 [@media(max-height:500px)]:py-1.5">
            {ADMIN_NAV.map((item) => {
              const active = isActivePath(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.to} className="min-w-0 max-w-full">
                  <Link
                    to={item.to}
                    className={cn(
                      "inline-flex h-auto min-h-[44px] max-w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium leading-snug transition-colors sm:gap-2 sm:px-3 sm:text-sm",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900",
                    )}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words lg:hidden">{item.shortLabel}</span>
                    <span className="hidden min-w-0 break-words lg:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 py-4 md:px-4 md:py-6 [@media(max-height:500px)]:py-3">
        {children}
      </main>
    </div>
  );
}
