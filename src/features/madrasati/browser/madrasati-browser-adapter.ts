import {
  BrowserAutomationUnavailableError,
  type BrowserAutomation,
  UnavailableBrowserAutomation,
} from "./browser-automation.ts";
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

/**
 * Future real Madrasati provider backed by browser automation.
 *
 * This adapter owns all future DOM/navigation/cookie concerns.
 * It must not expose Playwright types to the rest of the app.
 *
 * Today: no selectors, no live navigation, no credential handling.
 * Playwright/Puppeteer are not installed — operations fail closed.
 */
export class MadrasatiBrowserAdapter implements MadrasatiProvider {
  private readonly automation: BrowserAutomation;
  private sessionOpen = false;

  constructor(automation?: BrowserAutomation) {
    this.automation = automation ?? new UnavailableBrowserAutomation();
  }

  async connect(): Promise<MadrasatiConnectionStatus> {
    try {
      await this.automation.assertAvailable();
    } catch (error) {
      if (error instanceof BrowserAutomationUnavailableError) {
        return {
          state: "unavailable",
          message: error.message,
          isMock: false,
          browserAutomationAvailable: false,
        };
      }
      throw error;
    }

    // Package may exist later; scrape/login is still intentionally unimplemented.
    this.sessionOpen = false;
    throw new MadrasatiBrowserNotReadyError(
      "Browser automation package is present, but the Madrasati browser sync adapter is not implemented yet (vacation / platform updates).",
    );
  }

  async disconnect(): Promise<MadrasatiConnectionStatus> {
    this.sessionOpen = false;
    return {
      state: "disconnected",
      message: "تم قطع جلسة متصفح مدرستي (إن وُجدت).",
      isMock: false,
      browserAutomationAvailable: this.automation.kind !== "none",
    };
  }

  async getConnectionStatus(): Promise<MadrasatiConnectionStatus> {
    if (this.automation.kind === "none") {
      return {
        state: "unavailable",
        message: "أتمتة المتصفح غير مثبتة — مزامنة مدرستي الحية غير متاحة.",
        isMock: false,
        browserAutomationAvailable: false,
      };
    }

    return {
      state: this.sessionOpen ? "connected" : "not_implemented",
      message: this.sessionOpen
        ? "جلسة متصفح مفتوحة (مزامنة حية غير مكتملة)."
        : "محوّل متصفح مدرستي موجود لكن المزامنة الحية غير منفّذة بعد.",
      isMock: false,
      browserAutomationAvailable: true,
    };
  }

  async getTeacherProfile(): Promise<MadrasatiTeacher> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError();
  }

  async getTimetable(): Promise<MadrasatiTimetableEntry[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError();
  }

  async getClasses(): Promise<MadrasatiClass[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError();
  }

  async getSubjects(): Promise<MadrasatiSubject[]> {
    this.requireReadySession();
    throw new MadrasatiBrowserNotReadyError();
  }

  private requireReadySession(): void {
    if (!this.sessionOpen) {
      throw new MadrasatiNotConnectedError(
        "محوّل متصفح مدرستي غير متصل — المزامنة الحية غير جاهزة.",
      );
    }
  }
}
