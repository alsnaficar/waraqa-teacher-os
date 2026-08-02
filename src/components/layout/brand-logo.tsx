import React from "react";

interface BrandLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  src?: string;
  customHeight?: string;
}

export function BrandLogo({
  className = "",
  iconOnly = false,
  size = "md",
  src = "/branding/logos/logo-horizontal.png",
  customHeight,
}: BrandLogoProps) {
  const logoHeights = {
    sm: "h-8 md:h-9",
    md: "h-12 md:h-14",
    lg: "h-24 md:h-28",
  };

  const heightClass = customHeight || logoHeights[size];

  return (
    <img
      src={src}
      alt="ورقة"
      className={`${heightClass} w-auto object-contain shrink-0 ${className}`}
    />
  );
}
