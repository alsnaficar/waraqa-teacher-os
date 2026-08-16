import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";

type NavMetrics = {
  userAgent: string;
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
  clientHeight: number;
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  visualViewportOffsetLeft: number | null;
  devicePixelRatio: number;
  mediaMax767: boolean;
  mediaWidthLE767: boolean;
  navRectTop: number | null;
  navRectBottom: number | null;
  navRectHeight: number | null;
  navPaddingBottom: string | null;
  navPosition: string | null;
  navBottomCss: string | null;
  navTransform: string | null;
  firstIconBottom: number | null;
  firstLabelBottom: number | null;
  safeAreaProbe: string | null;
  stylesheets: string[];
};

function isDebugQueryEnabled(hrefOrSearch: string): boolean {
  try {
    if (hrefOrSearch.includes("://") || hrefOrSearch.startsWith("/")) {
      const queryIndex = hrefOrSearch.indexOf("?");
      const raw = queryIndex >= 0 ? hrefOrSearch.slice(queryIndex + 1) : "";
      if (new URLSearchParams(raw).get("bottomNavDebug") === "1") return true;
    } else {
      const raw = hrefOrSearch.startsWith("?") ? hrefOrSearch.slice(1) : hrefOrSearch;
      if (new URLSearchParams(raw).get("bottomNavDebug") === "1") return true;
    }
  } catch {
    /* ignore parse errors */
  }
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("bottomNavDebug") === "1";
}

function safeMatchMedia(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function collectMetrics(probe: HTMLDivElement | null): NavMetrics {
  const nav = document.querySelector("nav.bottom-nav-safe-area");
  const navStyle = nav ? getComputedStyle(nav) : null;
  const navRect = nav?.getBoundingClientRect();
  const firstIcon = nav?.querySelector("svg");
  const firstLabel = nav?.querySelector("a span.max-w-full");
  const vv = window.visualViewport;

  return {
    userAgent: navigator.userAgent,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    visualViewportWidth: vv?.width ?? null,
    visualViewportHeight: vv?.height ?? null,
    visualViewportOffsetTop: vv?.offsetTop ?? null,
    visualViewportOffsetLeft: vv?.offsetLeft ?? null,
    devicePixelRatio: window.devicePixelRatio,
    mediaMax767: safeMatchMedia("(max-width: 767px)"),
    mediaWidthLE767: safeMatchMedia("(width <= 767px)"),
    navRectTop: navRect?.top ?? null,
    navRectBottom: navRect?.bottom ?? null,
    navRectHeight: navRect?.height ?? null,
    navPaddingBottom: navStyle?.paddingBottom ?? null,
    navPosition: navStyle?.position ?? null,
    navBottomCss: navStyle?.bottom ?? null,
    navTransform: navStyle?.transform ?? null,
    firstIconBottom: firstIcon?.getBoundingClientRect().bottom ?? null,
    firstLabelBottom: firstLabel?.getBoundingClientRect().bottom ?? null,
    safeAreaProbe: probe ? getComputedStyle(probe).paddingBottom : null,
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(
      (node) => (node as HTMLLinkElement).href,
    ),
  };
}

function Row({ label, value }: { label: string; value: string | number | boolean | null }) {
  return (
    <div className="flex min-w-0 justify-between gap-2 border-b border-white/15 py-1">
      <span className="shrink-0 font-semibold">{label}</span>
      <span className="min-w-0 break-all text-end">{value === null ? "null" : String(value)}</span>
    </div>
  );
}

/** TEMPORARY TASK 25.38F — Honor bottom-nav diagnostic. Query-gated only. */
export function BottomNavHonorDebugPanel() {
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const enabled = isDebugQueryEnabled(locationHref);
  const [dismissed, setDismissed] = useState(false);
  const [metrics, setMetrics] = useState<NavMetrics | null>(null);

  const refresh = useCallback((probe: HTMLDivElement | null) => {
    setMetrics(collectMetrics(probe));
  }, []);

  useEffect(() => {
    if (!enabled || dismissed) return;

    const probe = document.createElement("div");
    probe.setAttribute("data-bottom-nav-debug-probe", "1");
    probe.style.cssText =
      "position:fixed;left:-9999px;bottom:0;width:1px;height:1px;" +
      "padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;";
    document.body.appendChild(probe);

    const update = () => refresh(probe);
    update();

    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      probe.remove();
    };
  }, [dismissed, enabled, refresh]);

  if (!enabled || dismissed || !metrics || typeof document === "undefined") return null;

  return createPortal(
    <aside
      dir="rtl"
      className="fixed inset-x-0 top-0 z-[9999] max-h-[45vh] w-full max-w-full overflow-x-hidden overflow-y-auto bg-zinc-950 p-3 text-[11px] leading-snug text-white shadow-lg"
      aria-label="BOTTOM NAV DEBUG"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black tracking-wide text-amber-300">BOTTOM NAV DEBUG</p>
        <button
          type="button"
          className="inline-flex h-11 min-h-[44px] items-center rounded-lg bg-amber-400 px-3 font-bold text-zinc-950"
          onClick={() => setDismissed(true)}
        >
          إغلاق التشخيص
        </button>
      </div>
      <Row label="userAgent" value={metrics.userAgent} />
      <Row label="innerWidth" value={metrics.innerWidth} />
      <Row label="innerHeight" value={metrics.innerHeight} />
      <Row label="clientWidth" value={metrics.clientWidth} />
      <Row label="clientHeight" value={metrics.clientHeight} />
      <Row label="visualViewport.width" value={metrics.visualViewportWidth} />
      <Row label="visualViewport.height" value={metrics.visualViewportHeight} />
      <Row label="visualViewport.offsetTop" value={metrics.visualViewportOffsetTop} />
      <Row label="visualViewport.offsetLeft" value={metrics.visualViewportOffsetLeft} />
      <Row label="devicePixelRatio" value={metrics.devicePixelRatio} />
      <Row label='matchMedia("(max-width: 767px)")' value={metrics.mediaMax767} />
      <Row label='matchMedia("(width <= 767px)")' value={metrics.mediaWidthLE767} />
      <Row label="nav.rect.top" value={metrics.navRectTop} />
      <Row label="nav.rect.bottom" value={metrics.navRectBottom} />
      <Row label="nav.rect.height" value={metrics.navRectHeight} />
      <Row label="nav.paddingBottom" value={metrics.navPaddingBottom} />
      <Row label="nav.position" value={metrics.navPosition} />
      <Row label="nav.bottom" value={metrics.navBottomCss} />
      <Row label="nav.transform" value={metrics.navTransform} />
      <Row label="firstIcon.bottom" value={metrics.firstIconBottom} />
      <Row label="firstLabel.bottom" value={metrics.firstLabelBottom} />
      <Row label="safeAreaProbe.paddingBottom" value={metrics.safeAreaProbe} />
      {metrics.stylesheets.map((href, index) => (
        <Row key={href} label={`stylesheet[${index}]`} value={href} />
      ))}
    </aside>,
    document.body,
  );
}
