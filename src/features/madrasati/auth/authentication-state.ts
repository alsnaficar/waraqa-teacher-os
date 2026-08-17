import type { MadrasatiAuthenticationState } from "../provider/models.ts";

export interface MadrasatiAuthenticationPageSnapshot {
  url: string;
  title: string;
  text: string;
}

/**
 * Detects Madrasati authentication state from a read-only page snapshot.
 *
 * Fail-closed:
 * unknown/intermediate pages are never treated as authenticated.
 */
export function detectMadrasatiAuthenticationState(
  page: MadrasatiAuthenticationPageSnapshot,
): MadrasatiAuthenticationState {
  const url = page.url.trim().toLowerCase();
  const title = page.title.trim().toLowerCase();
  const text = page.text.trim().toLowerCase();

  if (url.includes("login.microsoftonline.com")) {
    return "not_authenticated";
  }

  if (url.includes("schools.madrasati.sa/auth/signin") || text.includes("تسجيل الدخول")) {
    return "not_authenticated";
  }

  if (url === "https://schools.madrasati.sa/" || url === "https://schools.madrasati.sa") {
    if (title.includes("مدرستي") && (text.includes("لوحة التحكم") || text.includes("الرئيسية"))) {
      return "authenticated";
    }
  }

  return "not_authenticated";
}
