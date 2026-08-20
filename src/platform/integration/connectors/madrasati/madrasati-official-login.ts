/**
 * Official Madrasati login in the teacher's own browser.
 *
 * Waraqa only opens https://schools.madrasati.sa/Auth/SignIn and later tries
 * to close the window it opened. It never inspects that window's URL or
 * document (cross-origin), never copies cookies, and never claims a verified
 * Madrasati session from this flow.
 */

export const MADRASATI_LOGIN_URL = "https://schools.madrasati.sa/Auth/SignIn";

export const MADRASATI_LOGIN_WINDOW_NAME = "waraqa-madrasati-login";

export const MADRASATI_LOGIN_WINDOW_FEATURES =
  "popup,width=480,height=850,resizable=yes,scrollbars=yes";

export const MADRASATI_OFFICIAL_LOGIN_COPY = {
  title: "تسجيل الدخول إلى مدرستي",
  description: "سيتم فتح منصة مدرستي الرسمية في نافذة جديدة لتسجيل الدخول باستخدام حسابك.",
  securityNotice:
    "بيانات الدخول وكلمة المرور يتم إدخالها مباشرة في منصة مدرستي الرسمية ولا تمر عبر ورقة.",
  openButton: "فتح مدرستي",
  openedHeading: "مدرستي مفتوحة في نافذة أخرى",
  confirmButton: "تم تسجيل الدخول — العودة إلى ورقة",
  backButton: "العودة إلى ورقة",
  statusReady: "جاهز لفتح مدرستي",
  statusOpened: "تم فتح مدرستي. أكمل تسجيل الدخول ثم عد إلى هذه الصفحة.",
  statusReturned: "تمت العودة إلى ورقة",
  popupBlocked: "تعذر فتح نافذة مدرستي. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.",
  closeBlocked: "تعذر إغلاق نافذة مدرستي تلقائياً. يمكنك إغلاقها يدوياً ثم متابعة العمل في ورقة.",
  verificationNote:
    "ورقاء لا تتحقق من نتيجة تسجيل الدخول في متصفحك ولا تستلم بيانات الاعتماد أو ملفات تعريف الارتباط.",
} as const;

export type MadrasatiOfficialLoginPhase = "ready" | "opened" | "returned" | "blocked";

export type MadrasatiLoginWindowHandle = {
  closed: boolean;
  close: () => void;
  focus?: () => void;
  opener?: unknown;
};

export type OpenMadrasatiLoginWindowResult = {
  status: "opened" | "focused" | "blocked";
  popup: MadrasatiLoginWindowHandle | null;
};

export type CloseMadrasatiLoginWindowResult = "closed" | "already-closed" | "blocked";

export function getMadrasatiOfficialLoginStatus(phase: MadrasatiOfficialLoginPhase): string {
  switch (phase) {
    case "opened":
      return MADRASATI_OFFICIAL_LOGIN_COPY.statusOpened;
    case "returned":
      return MADRASATI_OFFICIAL_LOGIN_COPY.statusReturned;
    case "blocked":
      return MADRASATI_OFFICIAL_LOGIN_COPY.popupBlocked;
    default:
      return MADRASATI_OFFICIAL_LOGIN_COPY.statusReady;
  }
}

export function openMadrasatiLoginWindow(
  current: MadrasatiLoginWindowHandle | null,
  openWindow: (url: string, name: string, features: string) => MadrasatiLoginWindowHandle | null,
): OpenMadrasatiLoginWindowResult {
  if (current && !current.closed) {
    try {
      current.focus?.();
    } catch {
      // Cross-origin focus restrictions are ignorable.
    }

    return { status: "focused", popup: current };
  }

  const popup = openWindow(
    MADRASATI_LOGIN_URL,
    MADRASATI_LOGIN_WINDOW_NAME,
    MADRASATI_LOGIN_WINDOW_FEATURES,
  );

  if (!popup || popup.closed) {
    return { status: "blocked", popup: null };
  }

  try {
    popup.opener = null;
  } catch {
    // Some browsers freeze opener after navigation; ignore.
  }

  return { status: "opened", popup };
}

export function closeMadrasatiLoginWindow(
  popup: MadrasatiLoginWindowHandle | null,
): CloseMadrasatiLoginWindowResult {
  if (!popup || popup.closed) {
    return "already-closed";
  }

  try {
    popup.close();
  } catch {
    return "blocked";
  }

  return popup.closed ? "closed" : "blocked";
}
