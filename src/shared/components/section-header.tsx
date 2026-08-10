import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 max-w-full flex-1">
        <h1 className="break-words text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="w-full min-w-0 shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  );
}
