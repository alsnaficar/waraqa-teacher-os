import type { MadrasatiAuthenticationState } from "./models.ts";

import type {
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "./models.ts";

/**
 * Application-facing Madrasati provider.
 *
 * Waraqa must depend only on this interface — never on Playwright pages,
 * selectors, cookies, or Madrasati DOM details.
 *
 * Implementations:
 * - MockMadrasatiProvider (dev/test fixtures)
 * - MadrasatiBrowserAdapter (future real browser sync; not live yet)
 */
export interface MadrasatiAuthenticationPage {
  url: string;
  title: string;
  text: string;
  authenticationState: MadrasatiAuthenticationState;
}

export interface MadrasatiProvider {
  connect(): Promise<MadrasatiConnectionStatus>;
  beginAuthentication(): Promise<MadrasatiConnectionStatus>;
  inspectAuthenticationPage(): Promise<MadrasatiAuthenticationPage>;
  disconnect(): Promise<MadrasatiConnectionStatus>;
  getConnectionStatus(): Promise<MadrasatiConnectionStatus>;
  getTeacherProfile(): Promise<MadrasatiTeacher>;
  getTimetable(): Promise<MadrasatiTimetableEntry[]>;
  getClasses(): Promise<MadrasatiClass[]>;
  getSubjects(): Promise<MadrasatiSubject[]>;
}

export class MadrasatiProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MadrasatiProviderError";
    this.code = code;
  }
}

export class MadrasatiNotConnectedError extends MadrasatiProviderError {
  constructor(message = "مزود مدرستي غير متصل.") {
    super("NOT_CONNECTED", message);
    this.name = "MadrasatiNotConnectedError";
  }
}

export class MadrasatiBrowserNotReadyError extends MadrasatiProviderError {
  constructor(
    message = "مزامنة متصفح مدرستي غير جاهزة بعد — المنصة غير متاحة أو الأتمتة غير مفعّلة.",
  ) {
    super("BROWSER_NOT_READY", message);
    this.name = "MadrasatiBrowserNotReadyError";
  }
}
