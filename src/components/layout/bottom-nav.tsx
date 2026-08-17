import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  ClipboardCheck,
  BarChart3,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils/utils";

type NavItem = {
  to:
    | "/dashboard"
    | "/planner"
    | "/homework"
    | "/tests"
    | "/corrections"
    | "/reports"
    | "/settings";
  label: string;
  icon: LucideIcon;
};

/** Live mobile bottom destinations (RTL visual order: first = rightmost). */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", icon: Home },
  { to: "/planner", label: "الجدول", icon: CalendarDays },
  { to: "/homework", label: "الواجبات", icon: ClipboardList },
  { to: "/tests", label: "الاختبارات", icon: FlaskConical },
  { to: "/corrections", label: "التصحيح", icon: ClipboardCheck },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="التنقل السفلي"
      className="bottom-nav-safe-area fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] border-t border-white/40 dark:border-white/10 bg-white/75 dark:bg-zinc-950/75 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] backdrop-blur-lg transform-gpu will-change-[transform,backdrop-filter]"
    >
      <ul className="bottom-nav-items mx-auto grid max-w-3xl grid-cols-7">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.to} className="min-w-0">
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-1 px-0.5 py-2.5 text-[10px] font-medium transition-colors sm:text-[11px]",
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
                <span className="max-w-full truncate leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
