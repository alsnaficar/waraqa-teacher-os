import { useRouter, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/shared/ui/button";

export function BackButton({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  const router = useRouter();
  const navigate = useNavigate();

  function handleBack() {
    const canGoBack = typeof window !== "undefined" && window.history.length > 1;
    if (canGoBack) {
      router.history.back();
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <Button
      variant="ghost"
      aria-label="رجوع"
      onClick={handleBack}
      className={
        showText
          ? `h-8 rounded-md px-3 text-xs ${className || ""}`
          : `h-6 w-4 p-0 m-0 shrink-0 flex items-center justify-center ${className || ""}`
      }
    >
      <ArrowRight className="h-4 w-4 shrink-0" />
      {showText && <span>رجوع</span>}
    </Button>
  );
}
