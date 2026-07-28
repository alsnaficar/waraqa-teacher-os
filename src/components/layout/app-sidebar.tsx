import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Sparkles,
  Bell,
  Settings,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/platform/database/supabase/client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";
import { ar } from "@/i18n/ar";

const items = [
  { title: ar.nav.dashboard, url: "/dashboard", icon: LayoutDashboard },
  { title: ar.nav.curriculum, url: "/curriculum", icon: BookOpen },
  { title: ar.nav.planner, url: "/planner", icon: CalendarDays },
  { title: ar.nav.ai, url: "/ai", icon: Sparkles },
  { title: ar.nav.notifications, url: "/notifications", icon: Bell },
  { title: ar.nav.settings, url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkRole() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        if (user.email === "coonan89@gmail.com") {
          setIsAdmin(true);
          return;
        }
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.role === "admin") {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error("Error checking role in sidebar:", err);
      }
    }
    checkRole();
  }, []);

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
            و
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight">{ar.app.name}</p>
            <p className="truncate text-xs text-muted-foreground">{ar.app.tagline}</p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>القائمة</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {isAdmin && (
                <>
                  <SidebarMenuItem key="/curriculum-management">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/curriculum-management"}
                      tooltip="إدارة المناهج"
                    >
                      <Link
                        to="/curriculum-management"
                        className="flex items-center gap-2 text-primary font-medium"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>إدارة المناهج</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem key="/google-sheets">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/google-sheets"}
                      tooltip="تكامل Google Sheets"
                    >
                      <Link
                        to="/google-sheets"
                        className="flex items-center gap-2 text-emerald-600 font-medium hover:text-emerald-700"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>تكامل Google Sheets</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
