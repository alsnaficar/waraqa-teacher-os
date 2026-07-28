import type { ReactNode } from "react";
import { cn } from "@/shared/utils/utils";

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-3 p-2 md:space-y-4 md:p-4", className)}>
      {children}
    </div>
  );
}
