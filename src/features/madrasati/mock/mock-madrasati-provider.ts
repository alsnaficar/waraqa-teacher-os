import type {
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import {
  MadrasatiNotConnectedError,
  type MadrasatiAuthenticationPage,
  type MadrasatiProvider,
} from "../provider/madrasati-provider.ts";
import {
  MOCK_MADRASATI_CLASSES,
  MOCK_MADRASATI_SUBJECTS,
  MOCK_MADRASATI_TEACHER,
  MOCK_MADRASATI_TIMETABLE,
} from "./fixtures.ts";

export interface MockMadrasatiProviderOptions {
  teacher?: MadrasatiTeacher;
  subjects?: MadrasatiSubject[];
  classes?: MadrasatiClass[];
  timetable?: MadrasatiTimetableEntry[];
}

/**
 * Development/test Madrasati provider.
 * Replaceable by MadrasatiBrowserAdapter without changing sync consumers.
 *
 * Never accepts or stores Madrasati login credentials.
 */
export class MockMadrasatiProvider implements MadrasatiProvider {
  private connected = false;
  private readonly teacher: MadrasatiTeacher;
  private readonly subjects: MadrasatiSubject[];
  private readonly classes: MadrasatiClass[];
  private readonly timetable: MadrasatiTimetableEntry[];

  constructor(options: MockMadrasatiProviderOptions = {}) {
    this.teacher = options.teacher ?? MOCK_MADRASATI_TEACHER;
    this.subjects = options.subjects ?? [...MOCK_MADRASATI_SUBJECTS];
    this.classes = options.classes ?? [...MOCK_MADRASATI_CLASSES];
    this.timetable = options.timetable ?? MOCK_MADRASATI_TIMETABLE.map((row) => ({ ...row }));
  }

  async connect(): Promise<MadrasatiConnectionStatus> {
    this.connected = true;
    return this.status(
      "connected",
      "مزود مدرستي التجريبي متصل (بيانات وهمية — ليست منصة مدرستي الحية).",
    );
  }

  async beginAuthentication(): Promise<MadrasatiConnectionStatus> {
    this.requireConnected();

    return this.status("connected", "مصادقة مدرستي التجريبية جاهزة للاختبار.");
  }

  async inspectAuthenticationPage(): Promise<MadrasatiAuthenticationPage> {
    this.requireConnected();

    return {
      url: "mock://madrasati/auth/sign-in",
      title: "Madrasati Mock Sign-In",
      text: "Mock Madrasati authentication page.",
      authenticationState: "not_authenticated",
    };
  }

  async disconnect(): Promise<MadrasatiConnectionStatus> {
    this.connected = false;
    return this.status("disconnected", "تم قطع اتصال مزود مدرستي التجريبي.");
  }

  async getConnectionStatus(): Promise<MadrasatiConnectionStatus> {
    if (!this.connected) {
      return this.status("disconnected", "مزود مدرستي التجريبي غير متصل.");
    }
    return this.status(
      "connected",
      "مزود مدرستي التجريبي متصل (بيانات وهمية — ليست منصة مدرستي الحية).",
    );
  }

  async getTeacherProfile(): Promise<MadrasatiTeacher> {
    this.requireConnected();
    return { ...this.teacher };
  }

  async getTimetable(): Promise<MadrasatiTimetableEntry[]> {
    this.requireConnected();
    return this.timetable.map((row) => ({ ...row }));
  }

  async getClasses(): Promise<MadrasatiClass[]> {
    this.requireConnected();
    return this.classes.map((row) => ({ ...row }));
  }

  async getSubjects(): Promise<MadrasatiSubject[]> {
    this.requireConnected();
    return this.subjects.map((row) => ({ ...row }));
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new MadrasatiNotConnectedError();
    }
  }

  private status(
    state: MadrasatiConnectionStatus["state"],
    message: string,
  ): MadrasatiConnectionStatus {
    return {
      state,
      authenticationState: "authenticated",
      message,
      isMock: true,
      browserAutomationAvailable: false,
    };
  }
}
