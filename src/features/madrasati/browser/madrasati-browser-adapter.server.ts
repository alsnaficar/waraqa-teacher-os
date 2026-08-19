import {
  BrowserAutomationUnavailableError,
  type BrowserAutomation,
  type BrowserPageHandle,
  type BrowserSessionHandle,
  UnavailableBrowserAutomation,
} from "./browser-automation.ts";
import { detectMadrasatiAuthenticationState } from "../auth/authentication-state.ts";

import type {
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import {
  MadrasatiNotConnectedError,
  MadrasatiProviderError,
  type MadrasatiProvider,
} from "../provider/madrasati-provider.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";
import {
  extractMadrasatiTeacher,
  MADRASATI_TEACHER_PROFILE_UNAVAILABLE_CODE,
  MADRASATI_TEACHER_PROFILE_UNAVAILABLE_MESSAGE,
} from "./madrasati-teacher-profile.ts";
import {
  extractMadrasatiClasses,
  MADRASATI_CLASSES_UNAVAILABLE_CODE,
  MADRASATI_CLASSES_UNAVAILABLE_MESSAGE,
} from "./madrasati-classes.ts";
import {
  extractMadrasatiSubjects,
  MADRASATI_SUBJECTS_UNAVAILABLE_CODE,
  MADRASATI_SUBJECTS_UNAVAILABLE_MESSAGE,
} from "./madrasati-subjects.ts";
import {
  extractMadrasatiTimetable,
  MADRASATI_TIMETABLE_UNAVAILABLE_CODE,
  MADRASATI_TIMETABLE_UNAVAILABLE_MESSAGE,
} from "./madrasati-timetable.ts";

const MADRASATI_URL = "https://schools.madrasati.sa/";

const MADRASATI_AUTH_VIEWPORT = {
  width: 390,
  height: 844,
} as const;

const MADRASATI_MICROSOFT_LOGIN_NAMES = [
  "الدخول بحساب مايكروسوفت",
  "Sign in with Microsoft",
] as const;

const MICROSOFT_EMAIL_NEXT_NAMES = [
  "Next",
  "التالي",
  "Suivant",
  "Weiter",
  "Siguiente",
] as const;

export class MadrasatiBrowserAdapter implements MadrasatiProvider {
  private readonly automation: BrowserAutomation;
  private session: BrowserSessionHandle | null = null;
  private page: BrowserPageHandle | null = null;

  constructor(automation?: BrowserAutomation) {
    this.automation = automation ?? new UnavailableBrowserAutomation();
  }

  async connect(): Promise<MadrasatiConnectionStatus> {
    try {
      await this.automation.assertAvailable();

      if (this.session && this.page) {
        return {
          state: "connected",
          authenticationState: "not_authenticated",
          message: "جلسة متصفح مدرستي مفتوحة.",
          isMock: false,
          browserAutomationAvailable: true,
        };
      }

      const session = await this.automation.openSession({
        viewport: MADRASATI_AUTH_VIEWPORT,
      });

      try {
        const page = await this.automation.openPage(session);

        try {
          await this.automation.goto(page, MADRASATI_URL, {
            timeoutMs: 30000,
            waitUntil: "domcontentloaded",
          });

          this.session = session;
          this.page = page;

          return {
            state: "connected",
            authenticationState: "not_authenticated",
            message:
              "تم فتح جلسة متصفح الخادم والوصول إلى منصة مدرستي. لم يتم تنفيذ تسجيل الدخول أو مزامنة البيانات بعد.",
            isMock: false,
            browserAutomationAvailable: true,
          };
        } catch (error) {
          await this.automation.closePage(page);
          throw error;
        }
      } catch (error) {
        await this.automation.closeSession(session);
        throw error;
      }
    } catch (error) {
      if (error instanceof BrowserAutomationUnavailableError) {
        return {
          state: "unavailable",
          authenticationState: "not_authenticated",
          message: error.message,
          isMock: false,
          browserAutomationAvailable: false,
        };
      }

      this.session = null;
      this.page = null;
      throw error;
    }
  }

  async beginAuthentication(): Promise<MadrasatiConnectionStatus> {
    this.requireReadySession();

    await this.automation.goto(this.page!, "https://schools.madrasati.sa/Auth/SignIn", {
      timeoutMs: 30000,
      waitUntil: "domcontentloaded",
    });

    const currentUrl = await this.automation.getPageUrl(this.page!);

    await this.startAuthenticationLiveView();

    return {
      state: "connected",
      authenticationState: "not_authenticated",
      message: currentUrl.includes("login.microsoftonline.com")
        ? "تم فتح بوابة تسجيل الدخول الموحد لمدرستي. لم يتم إدخال بيانات الاعتماد أو تنفيذ تسجيل الدخول بعد."
        : "تم فتح صفحة تسجيل الدخول في جلسة متصفح مدرستي. لم يتم تنفيذ تسجيل الدخول بعد.",
      isMock: false,
      browserAutomationAvailable: true,
    };
  }

  async inspectAuthenticationPage() {
    this.requireReadySession();

    const url = await this.automation.getPageUrl(this.page!);
    const title = await this.automation.getPageTitle(this.page!);
    const text = await this.automation.getPageText(this.page!);

    return {
      url,
      title,
      text,
      authenticationState: detectMadrasatiAuthenticationState({
        url,
        title,
        text,
      }),
    };
  }

  async getAuthenticationScreenshot(): Promise<Uint8Array> {
    this.requireReadySession();

    return this.automation.getPageScreenshot(this.page!);
  }

  async clickAuthentication(
    x: number,
    y: number,
  ): Promise<void> {
    this.requireReadySession();
    await this.automation.clickPage(this.page!, x, y);
  }

  async typeAuthentication(text: string): Promise<void> {
    this.requireReadySession();

    if (!text || typeof text !== "string") {
      throw new Error("Authentication text is required.");
    }

    await this.automation.focusEditableControl(this.page!);
    await this.automation.typePage(this.page!, text);
  }

  async pressAuthenticationKey(key: string): Promise<void> {
    this.requireReadySession();

    if (!key || typeof key !== "string" || !key.trim()) {
      throw new Error("Authentication key is required.");
    }

    await this.automation.pressPageKey(this.page!, key.trim());
  }

  async focusAuthenticationEditableControl(): Promise<MadrasatiFocusedControl> {
    this.requireReadySession();

    await this.automation.focusEditableControl(this.page!);

    return this.inspectAuthenticationFocus();
  }

  async clickAuthenticationByAccessibleName(
    names: readonly string[],
  ): Promise<boolean> {
    this.requireReadySession();

    const needles = names.map((name) => name.trim()).filter(Boolean);

    if (needles.length === 0) {
      throw new Error("Authentication control name is required.");
    }

    return this.automation.clickControlByAccessibleName(this.page!, needles);
  }

  /**
   * Advances Microsoft's email step only.
   *
   * Prefers a stable accessible Next control. Falls back to Enter on the
   * focused email field. Never types a password or MFA code.
   */
  async submitAuthenticationEmail() {
    this.requireReadySession();

    await this.automation.focusEditableControl(this.page!);

    const clickedNext = await this.automation.clickControlByAccessibleName(
      this.page!,
      MICROSOFT_EMAIL_NEXT_NAMES,
    );

    if (!clickedNext) {
      await this.automation.pressPageKey(this.page!, "Enter");
    }

    return this.inspectAuthenticationPage();
  }

  async openMicrosoftAuthentication(): Promise<boolean> {
    this.requireReadySession();

    const currentUrl = await this.automation.getPageUrl(this.page!);

    if (isMicrosoftLoginHostname(currentUrl)) {
      return true;
    }

    return this.automation.clickControlByAccessibleName(
      this.page!,
      MADRASATI_MICROSOFT_LOGIN_NAMES,
    );
  }

  async startAuthenticationLiveView(): Promise<void> {
    this.requireReadySession();

    try {
      await this.automation.startPageLiveView(this.page!);
    } catch {
      // Live view is optional. PNG screenshot fallback remains available.
    }
  }

  async getAuthenticationLiveFrame(): Promise<MadrasatiLiveFrame> {
    this.requireReadySession();

    return this.automation.getPageLiveFrame(this.page!);
  }

  async inspectAuthenticationFocus(): Promise<MadrasatiFocusedControl> {
    this.requireReadySession();

    return this.automation.inspectFocusedControl(this.page!);
  }

  subscribeAuthenticationLiveFrame(
    listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    this.requireReadySession();

    return this.automation.subscribePageLiveFrame(this.page!, listener);
  }

  async disconnect(): Promise<MadrasatiConnectionStatus> {
    const page = this.page;
    const session = this.session;

    this.page = null;
    this.session = null;

    if (page) {
      await this.automation.closePage(page);
    }

    if (session) {
      await this.automation.closeSession(session);
    }

    return {
      state: "disconnected",
      authenticationState: "not_authenticated",
      message: "تم قطع جلسة متصفح مدرستي.",
      isMock: false,
      browserAutomationAvailable: this.automation.kind !== "none",
    };
  }

  async getConnectionStatus(): Promise<MadrasatiConnectionStatus> {
    if (this.automation.kind === "none") {
      return {
        state: "unavailable",
        authenticationState: "not_authenticated",
        message: "أتمتة المتصفح غير مثبتة — مزامنة مدرستي الحية غير متاحة.",
        isMock: false,
        browserAutomationAvailable: false,
      };
    }

    return {
      state: this.session && this.page ? "connected" : "not_implemented",
      authenticationState: "not_authenticated",
      message:
        this.session && this.page
          ? "جلسة متصفح مدرستي مفتوحة."
          : "محوّل متصفح مدرستي جاهز لكن لم تُفتح جلسة بعد.",
      isMock: false,
      browserAutomationAvailable: true,
    };
  }

  async getTeacherProfile(): Promise<MadrasatiTeacher> {
    this.requireReadySession();

    const inspection = await this.inspectAuthenticationPage();

    if (inspection.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "لا يمكن قراءة ملف المعلم قبل اكتمال تسجيل الدخول إلى مدرستي.",
      );
    }

    const fromHome = extractMadrasatiTeacher(
      await this.automation.readPageLandmarks(this.page!),
    );

    if (fromHome) {
      return fromHome;
    }

    const openedProfile = await this.automation.clickControlByAccessibleName(
      this.page!,
      ["الملف الشخصي", "حسابي", "تعديل بياناتي", "بياناتي"],
    );

    if (openedProfile) {
      await this.automation.waitForPageText(this.page!, "تعديل بياناتي", 4000);
      await this.automation.clickControlByAccessibleName(this.page!, [
        "تعديل بياناتي",
        "بياناتي",
      ]);
      await this.automation.waitForPageText(this.page!, "الاسم", 8000);
    }

    const fromProfile = extractMadrasatiTeacher(
      await this.automation.readPageLandmarks(this.page!),
    );

    await this.automation.clickControlByAccessibleName(this.page!, [
      "الرئيسية",
      "الصفحة الرئيسية",
    ]);

    if (fromProfile) {
      return fromProfile;
    }

    throw new MadrasatiProviderError(
      MADRASATI_TEACHER_PROFILE_UNAVAILABLE_CODE,
      MADRASATI_TEACHER_PROFILE_UNAVAILABLE_MESSAGE,
    );
  }

  async getTimetable(): Promise<MadrasatiTimetableEntry[]> {
    this.requireReadySession();

    const inspection = await this.inspectAuthenticationPage();

    if (inspection.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "لا يمكن قراءة الجدول قبل اكتمال تسجيل الدخول إلى مدرستي.",
      );
    }

    const fromCurrent = extractMadrasatiTimetable(
      await this.automation.readPageLandmarks(this.page!),
    );

    if (fromCurrent.status === "found") {
      return [...fromCurrent.entries];
    }

    if (fromCurrent.status === "empty") {
      return [];
    }

    await this.automation.clickControlByAccessibleName(this.page!, [
      "جدولي",
      "الجدول الدراسي",
      "جدول الحصص",
      "الجدول",
    ]);
    await this.waitForTimetable();

    const fromTimetable = extractMadrasatiTimetable(
      await this.automation.readPageLandmarks(this.page!),
    );

    await this.automation.clickControlByAccessibleName(this.page!, [
      "الرئيسية",
      "الصفحة الرئيسية",
    ]);

    const after = await this.inspectAuthenticationPage();

    if (after.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "انتهت جلسة مدرستي أثناء قراءة الجدول.",
      );
    }

    if (fromTimetable.status === "found") {
      return [...fromTimetable.entries];
    }

    if (fromTimetable.status === "empty") {
      return [];
    }

    throw new MadrasatiProviderError(
      MADRASATI_TIMETABLE_UNAVAILABLE_CODE,
      MADRASATI_TIMETABLE_UNAVAILABLE_MESSAGE,
    );
  }

  async getClasses(): Promise<MadrasatiClass[]> {
    this.requireReadySession();

    const inspection = await this.inspectAuthenticationPage();

    if (inspection.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "لا يمكن قراءة الفصول قبل اكتمال تسجيل الدخول إلى مدرستي.",
      );
    }

    const fromCurrent = extractMadrasatiClasses(
      await this.automation.readPageLandmarks(this.page!),
    );

    if (fromCurrent.status === "found") {
      return [...fromCurrent.classes];
    }

    if (fromCurrent.status === "empty") {
      return [];
    }

    await this.automation.clickControlByAccessibleName(this.page!, [
      "المقررات والمصادر",
      "المقررات",
    ]);
    await this.automation.clickControlByAccessibleName(this.page!, ["مقرراتي"]);
    await this.waitForClassCatalog();

    const fromCourses = extractMadrasatiClasses(
      await this.automation.readPageLandmarks(this.page!),
    );

    await this.automation.clickControlByAccessibleName(this.page!, [
      "الرئيسية",
      "الصفحة الرئيسية",
    ]);

    const after = await this.inspectAuthenticationPage();

    if (after.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "انتهت جلسة مدرستي أثناء قراءة الفصول.",
      );
    }

    if (fromCourses.status === "found") {
      return [...fromCourses.classes];
    }

    if (fromCourses.status === "empty") {
      return [];
    }

    throw new MadrasatiProviderError(
      MADRASATI_CLASSES_UNAVAILABLE_CODE,
      MADRASATI_CLASSES_UNAVAILABLE_MESSAGE,
    );
  }

  async getSubjects(): Promise<MadrasatiSubject[]> {
    this.requireReadySession();

    const inspection = await this.inspectAuthenticationPage();

    if (inspection.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "لا يمكن قراءة المواد قبل اكتمال تسجيل الدخول إلى مدرستي.",
      );
    }

    const fromCurrent = extractMadrasatiSubjects(
      await this.automation.readPageLandmarks(this.page!),
    );

    if (fromCurrent.status === "found") {
      return [...fromCurrent.subjects];
    }

    if (fromCurrent.status === "empty") {
      return [];
    }

    await this.automation.clickControlByAccessibleName(this.page!, [
      "المقررات والمصادر",
      "المقررات",
    ]);
    await this.automation.clickControlByAccessibleName(this.page!, ["مقرراتي"]);
    await this.waitForClassCatalog();

    const fromCourses = extractMadrasatiSubjects(
      await this.automation.readPageLandmarks(this.page!),
    );

    await this.automation.clickControlByAccessibleName(this.page!, [
      "الرئيسية",
      "الصفحة الرئيسية",
    ]);

    const after = await this.inspectAuthenticationPage();

    if (after.authenticationState !== "authenticated") {
      throw new MadrasatiProviderError(
        "NOT_AUTHENTICATED",
        "انتهت جلسة مدرستي أثناء قراءة المواد.",
      );
    }

    if (fromCourses.status === "found") {
      return [...fromCourses.subjects];
    }

    if (fromCourses.status === "empty") {
      return [];
    }

    throw new MadrasatiProviderError(
      MADRASATI_SUBJECTS_UNAVAILABLE_CODE,
      MADRASATI_SUBJECTS_UNAVAILABLE_MESSAGE,
    );
  }

  private requireReadySession(): void {
    if (!this.session || !this.page) {
      throw new MadrasatiNotConnectedError("محوّل متصفح مدرستي غير متصل.");
    }
  }

  private async waitForClassCatalog(): Promise<void> {
    const needles = ["الشعبة", "لا توجد مقررات", "لا يوجد مقررات", "الصف الدراسي", "مقرراتي"];

    for (const needle of needles) {
      if (await this.automation.waitForPageText(this.page!, needle, 4000)) {
        return;
      }
    }
  }

  private async waitForTimetable(): Promise<void> {
    const needles = [
      "الأحد",
      "الحصة",
      "لا يوجد جدول",
      "لا توجد حصص",
      "لا يوجد حصص",
      "الجدول فارغ",
    ];

    for (const needle of needles) {
      if (await this.automation.waitForPageText(this.page!, needle, 4000)) {
        return;
      }
    }
  }
}

function isMicrosoftLoginHostname(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return (
      hostname === "login.microsoftonline.com" ||
      hostname.endsWith(".microsoftonline.com") ||
      hostname === "login.live.com" ||
      hostname === "login.microsoft.com"
    );
  } catch {
    return false;
  }
}
