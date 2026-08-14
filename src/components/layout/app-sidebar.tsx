import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  FlaskConical,
  Settings,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";

import { useEffect, useState } from "react";
import { supabase } from "@/platform/database/supabase/client";
import { BrandLogo } from "./brand-logo";

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
  { title: "الجدول", url: "/planner", icon: CalendarDays },
  { title: "الواجبات", url: "/homework", icon: ClipboardList },
  { title: "الاختبارات", url: "/tests", icon: FlaskConical },
  { title: "التصحيح", url: "/corrections", icon: ClipboardCheck },
  { title: "الاشتراك", url: "/subscription", icon: CreditCard },
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
          <BrandLogo size="sm" />
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
                  <SidebarMenuItem key="/admin/curriculum-management">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/admin/curriculum-management"}
                      tooltip="إدارة المناهج"
                    >
                      <Link
                        to="/admin/curriculum-management"
                        className="flex items-center gap-2 text-primary font-medium"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>إدارة المناهج</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem key="/admin/google-sheets">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/admin/google-sheets"}
                      tooltip="تكامل Google Sheets"
                    >
                      <Link
                        to="/admin/google-sheets"
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
