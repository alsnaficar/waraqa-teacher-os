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
  MadrasatiBrowserNotReadyError,
  MadrasatiNotConnectedError,
  type MadrasatiProvider,
} from "../provider/madrasati-provider.ts";

const MADRASATI_URL = "https://schools.madrasati.sa/";

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

      const session = await this.automation.openSession();

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
    throw new MadrasatiBrowserNotReadyError(
      "تم فتح جلسة مدرستي، لكن قراءة ملف المعلم لم تُنفّذ بعد.",
    );
  }

  async getTimetable(): Promise<MadrasatiTimetableEntry[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError("تم فتح جلسة مدرستي، لكن قراءة الجدول لم تُنفّذ بعد.");
  }

  async getClasses(): Promise<MadrasatiClass[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError("تم فتح جلسة مدرستي، لكن قراءة الفصول لم تُنفّذ بعد.");
  }

  async getSubjects(): Promise<MadrasatiSubject[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError("تم فتح جلسة مدرستي، لكن قراءة المواد لم تُنفّذ بعد.");
  }

  private requireReadySession(): void {
    if (!this.session || !this.page) {
      throw new MadrasatiNotConnectedError("محوّل متصفح مدرستي غير متصل.");
    }
  }
}
