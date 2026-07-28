import * as React from "react";

interface HeaderCellProps {
  children: React.ReactNode;
}

export function HeaderCell({ children }: HeaderCellProps) {
  return (
    <div className="flex items-center justify-center gap-0.5 border-b border-border/70 bg-muted/60 px-0.5 py-0 text-xs font-semibold text-foreground md:text-sm h-5 sm:h-6 min-w-0 overflow-hidden break-words text-center">
      {children}
    </div>
  );
}
