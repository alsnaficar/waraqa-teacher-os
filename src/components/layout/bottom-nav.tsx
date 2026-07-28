import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, ClipboardCheck, BarChart3, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: "/dashboard" | "/planner" | "/corrections" | "/reports" | "/settings";
  label: string;
  icon: LucideIcon;
};

// Right-to-left order (RTL): Home first (rightmost)
const ITEMS: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", icon: Home },
  { to: "/planner", label: "الجدول", icon: CalendarDays },
  { to: "/corrections", label: "تصحيح الواجبات والاختبارات", icon: ClipboardCheck },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] border-t border-white/40 dark:border-white/10 bg-white/75 dark:bg-zinc-950/75 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] backdrop-blur-lg transform-gpu will-change-[transform,backdrop-filter]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {ITEMS.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-xl transition-colors",
                    active ? "bg-primary/15 text-primary" : "bg-transparent",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
