import type { MadrasatiAuthenticationState } from "../provider/models.ts";

export interface MadrasatiAuthenticationPageSnapshot {
  url: string;
  title: string;
  text: string;
}

/**
 * Authenticated Madrasati teacher (and compatible parent) home markers.
 *
 * Teacher home after Microsoft SSO typically shows جدولي / المقررات /
 * الواجبات rather than parent labels like قائمة الأبناء.
 */
const AUTHENTICATED_MARKERS = [
  "قائمة المدارس",
  "قائمة الأبناء",
  "الإعلانات",
  "لوحة التحكم",
  "الرئيسية",
  "الجدول",
  "الفصول",
  "المواد",
  "جدولي",
  "المقررات",
  "الواجبات",
  "الاختبارات",
  "تسجيل الخروج",
  "الكادر التعليمي",
] as const;

const REQUIRED_AUTHENTICATED_MARKERS = 2;

/**
 * Detects Madrasati authentication state from a read-only page snapshot.
 *
 * Fail-closed:
 * Microsoft login, SignIn, unknown hosts, and Madrasati pages without
 * enough authenticated markers are never treated as authenticated.
 */
export function detectMadrasatiAuthenticationState(
  page: MadrasatiAuthenticationPageSnapshot,
): MadrasatiAuthenticationState {
  const url = page.url.trim();
  const title = page.title.trim();
  const text = page.text.trim();
  const haystack = `${title}\n${text}`;

  if (isMicrosoftLoginUrl(url)) {
    return "not_authenticated";
  }

  if (isMadrasatiSignInUrl(url)) {
    return "not_authenticated";
  }

  if (!isMadrasatiAppHost(url)) {
    return "not_authenticated";
  }

  if (countAuthenticatedMarkers(haystack) >= REQUIRED_AUTHENTICATED_MARKERS) {
    return "authenticated";
  }

  return "not_authenticated";
}

function countAuthenticatedMarkers(haystack: string): number {
  return AUTHENTICATED_MARKERS.reduce(
    (count, marker) => (haystack.includes(marker) ? count + 1 : count),
    0,
  );
}

function isMicrosoftLoginUrl(url: string): boolean {
  const hostname = readHostname(url);

  return (
    hostname === "login.microsoftonline.com" ||
    hostname.endsWith(".microsoftonline.com") ||
    hostname === "login.live.com" ||
    hostname === "login.microsoft.com"
  );
}

function isMadrasatiAppHost(url: string): boolean {
  const hostname = readHostname(url);

  return hostname === "madrasati.sa" || hostname.endsWith(".madrasati.sa");
}

function isMadrasatiSignInUrl(url: string): boolean {
  if (!isMadrasatiAppHost(url)) {
    return false;
  }

  const pathname = readPathname(url).toLowerCase();

  return pathname.includes("/auth/signin") || pathname.includes("/auth/login");
}

function readHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
