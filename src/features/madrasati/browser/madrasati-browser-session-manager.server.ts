import { randomUUID } from "node:crypto";
import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import {
  PlaywrightBrowserAutomation,
} from "./playwright-browser-automation.server.ts";
import type { MadrasatiAuthenticationPage } from "../provider/madrasati-provider.ts";
import type { MadrasatiClass, MadrasatiSubject, MadrasatiTeacher, MadrasatiTimetableEntry } from "../provider/models.ts";
import { MadrasatiProviderError } from "../provider/madrasati-provider.ts";
import {
  EMPTY_TIMETABLE_VALIDATION,
  buildMissingSessionReport,
  buildMockSessionStopReport,
  extractionFromValue,
  logLiveVerificationSummary,
  sanitizeClassSnapshots,
  sanitizeSubjectSnapshots,
  sanitizeTeacherSnapshot,
  sanitizeTimetableSnapshots,
  toExtractionFailure,
  validateTimetableSnapshots,
  type MadrasatiExtractionResult,
  type MadrasatiExtractionSuccess,
  type MadrasatiLiveVerificationReport,
} from "./madrasati-live-verification.ts";
import {
  madrasatiLiveFrameHub,
  sanitizeFocusedControl,
  sanitizeLiveFrame,
  type MadrasatiFocusedControl,
  type MadrasatiLiveFrame,
  type MadrasatiLiveFrameUpdate,
} from "./madrasati-browser-live-session.ts";

const SESSION_TTL_MS = 15 * 60 * 1000;

export type MadrasatiBrowserSessionManagerOptions = {
  readonly createProvider?: () => MadrasatiBrowserAdapter;
  readonly ttlMs?: number;
};

type BrowserSessionRecord = {
  readonly sessionId: string;
  readonly userId: string;
  readonly provider: MadrasatiBrowserAdapter;
  readonly createdAt: number;
  lastUsedAt: number;
  unsubscribeLive?: () => void;
};

export interface MadrasatiBrowserSessionInfo {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

export interface MadrasatiBrowserAuthenticationStart {
  session: MadrasatiBrowserSessionInfo;
  url: string;
  authenticationState: "not_authenticated" | "authenticated";
  message: string;
}

export class MadrasatiBrowserSessionManager {
  private readonly createProvider: () => MadrasatiBrowserAdapter;

  private readonly ttlMs: number;

  private readonly sessions = new Map<string, BrowserSessionRecord>();

  private readonly sessionsByUser = new Map<string, string>();

  constructor(options: MadrasatiBrowserSessionManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;

    if (options.createProvider) {
      this.createProvider = options.createProvider;
    } else {
      const automation = new PlaywrightBrowserAutomation();
      this.createProvider = () => new MadrasatiBrowserAdapter(automation);
    }
  }

  async startAuthentication(
    userId: string,
  ): Promise<MadrasatiBrowserAuthenticationStart> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (existingId) {
      const existing = this.sessions.get(existingId);

      if (existing) {
        existing.lastUsedAt = Date.now();

        await existing.provider.startAuthenticationLiveView();
        this.attachLivePublisher(existing);

        const page = await existing.provider.inspectAuthenticationPage();

        return {
          session: this.toSessionInfo(existing),
          url: page.url,
          authenticationState: page.authenticationState,
          message:
            "توجد جلسة متصفح مدرستي مفتوحة لهذا المستخدم وتمت إعادة استخدامها.",
        };
      }

      this.sessionsByUser.delete(ownerId);
    }

    const provider = this.createProvider();

    await provider.connect();

    try {
      const status = await provider.beginAuthentication();

      const now = Date.now();
      const sessionId = randomUUID();

      const record: BrowserSessionRecord = {
        sessionId,
        userId: ownerId,
        provider,
        createdAt: now,
        lastUsedAt: now,
      };

      this.sessions.set(sessionId, record);
      this.sessionsByUser.set(ownerId, sessionId);

      await provider.startAuthenticationLiveView();
      this.attachLivePublisher(record);

      const page = await provider.inspectAuthenticationPage();

      return {
        session: this.toSessionInfo(record),
        url: page.url,
        authenticationState: page.authenticationState,
        message: status.message,
      };
    } catch (error) {
      await provider.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async inspectAuthentication(
    userId: string,
    sessionId: string,
  ): Promise<MadrasatiAuthenticationPage> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    return record.provider.inspectAuthenticationPage();
  }

  /**
   * Read-only status of the caller's existing session, if any.
   * Never starts a browser and never returns page text, cookies, or URLs.
   */
  async peekAuthentication(userId: string): Promise<{
    hasSession: boolean;
    authenticationState: "not_authenticated" | "authenticated";
  }> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (!existingId) {
      return {
        hasSession: false,
        authenticationState: "not_authenticated",
      };
    }

    const existing = this.sessions.get(existingId);

    if (!existing) {
      this.sessionsByUser.delete(ownerId);

      return {
        hasSession: false,
        authenticationState: "not_authenticated",
      };
    }

    existing.lastUsedAt = Date.now();

    try {
      const page = await existing.provider.inspectAuthenticationPage();

      return {
        hasSession: true,
        authenticationState:
          page.authenticationState === "authenticated"
            ? "authenticated"
            : "not_authenticated",
      };
    } catch {
      return {
        hasSession: true,
        authenticationState: "not_authenticated",
      };
    }
  }

  /**
   * Read-only teacher profile from the caller's authenticated live session.
   * Never writes to the database and never returns HTML or cookies.
   */
  async readTeacherProfile(userId: string): Promise<MadrasatiTeacher> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (!existingId) {
      throw new Error("Madrasati browser session was not found or has expired.");
    }

    const record = this.requireOwnedSession(ownerId, existingId);

    record.lastUsedAt = Date.now();

    return record.provider.getTeacherProfile();
  }

  /**
   * Read-only assigned classes from the caller's authenticated live session.
   * Never writes to the database and never returns HTML or cookies.
   */
  async readClasses(userId: string): Promise<MadrasatiClass[]> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (!existingId) {
      throw new Error("Madrasati browser session was not found or has expired.");
    }

    const record = this.requireOwnedSession(ownerId, existingId);

    record.lastUsedAt = Date.now();

    return record.provider.getClasses();
  }

  /**
   * Read-only assigned subjects from the caller's authenticated live session.
   * Never writes to the database and never returns HTML or cookies.
   */
  async readSubjects(userId: string): Promise<MadrasatiSubject[]> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (!existingId) {
      throw new Error("Madrasati browser session was not found or has expired.");
    }

    const record = this.requireOwnedSession(ownerId, existingId);

    record.lastUsedAt = Date.now();

    return record.provider.getSubjects();
  }

  /**
   * Read-only teacher timetable from the caller's authenticated live session.
   * Never writes to the database and never returns HTML or cookies.
   */
  async readTimetable(userId: string): Promise<MadrasatiTimetableEntry[]> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);

    if (!existingId) {
      throw new Error("Madrasati browser session was not found or has expired.");
    }

    const record = this.requireOwnedSession(ownerId, existingId);

    record.lastUsedAt = Date.now();

    return record.provider.getTimetable();
  }

  /**
   * Read-only live verification of teacher/classes/subjects/timetable.
   * Reuses the existing owned session. Never starts a browser, never writes,
   * and never returns HTML, cookies, or Playwright objects.
   */
  async verifyLiveExtraction(userId: string): Promise<MadrasatiLiveVerificationReport> {
    const ownerId = this.requireUserId(userId);

    await this.cleanupExpired();

    const existingId = this.sessionsByUser.get(ownerId);
    const existedBefore = Boolean(existingId && this.sessions.has(existingId));

    if (!existingId || !existedBefore) {
      const report = buildMissingSessionReport();
      logLiveVerificationSummary(report);
      return report;
    }

    const record = this.sessions.get(existingId);
    if (!record) {
      const report = buildMissingSessionReport();
      logLiveVerificationSummary(report);
      return report;
    }

    record.lastUsedAt = Date.now();

    const connection = await record.provider.getConnectionStatus();
    if (connection.isMock) {
      const report = buildMockSessionStopReport(true);
      logLiveVerificationSummary(report);
      return report;
    }

    const sessionIdBefore = record.sessionId;
    const authBefore = await this.peekAuthentication(ownerId);
    const authenticatedBefore = authBefore.authenticationState === "authenticated";

    const teacher = await this.readExtraction(async () => {
      const snapshot = sanitizeTeacherSnapshot(await record.provider.getTeacherProfile());
      if (!snapshot) {
        throw new MadrasatiProviderError(
          "TEACHER_PROFILE_UNAVAILABLE",
          "تعذر قراءة اسم المعلم من جلسة مدرستي.",
        );
      }
      return extractionFromValue(snapshot, false);
    });

    const sessionAfterTeacher = this.sessionsByUser.get(ownerId);

    const classes = await this.readExtraction(async () => {
      const snapshots = sanitizeClassSnapshots(await record.provider.getClasses());
      return extractionFromValue(snapshots, snapshots.length === 0);
    });

    const sessionAfterClasses = this.sessionsByUser.get(ownerId);

    const subjects = await this.readExtraction(async () => {
      const snapshots = sanitizeSubjectSnapshots(await record.provider.getSubjects());
      return extractionFromValue(snapshots, snapshots.length === 0);
    });

    const sessionAfterSubjects = this.sessionsByUser.get(ownerId);

    const timetable = await this.readExtraction(async () => {
      const snapshots = sanitizeTimetableSnapshots(await record.provider.getTimetable());
      return extractionFromValue(snapshots, snapshots.length === 0);
    });

    const sessionAfterTimetable = this.sessionsByUser.get(ownerId);
    const stillPresent = this.sessions.get(sessionIdBefore);
    const authAfter = await this.peekAuthentication(ownerId);
    const remainedAuthenticated =
      authenticatedBefore && authAfter.authenticationState === "authenticated";
    const secondSessionCreated =
      [sessionAfterTeacher, sessionAfterClasses, sessionAfterSubjects, sessionAfterTimetable].some(
        (id) => id != null && id !== sessionIdBefore,
      );

    const timetableValidation = timetable.success
      ? validateTimetableSnapshots(timetable.data)
      : EMPTY_TIMETABLE_VALIDATION;

    const report: MadrasatiLiveVerificationReport = {
      authenticated: remainedAuthenticated,
      connection: "LIVE",
      isMock: false,
      stoppedBecauseMock: false,
      teacher,
      classes,
      subjects,
      timetable,
      timetableValidation,
      session: {
        existedBefore: true,
        remainedAlive: Boolean(stillPresent) && !secondSessionCreated,
        remainedAuthenticated,
        secondSessionCreated,
      },
      databaseWrites: "NONE",
    };

    logLiveVerificationSummary(report);
    return report;
  }

  private async readExtraction<T>(
    read: () => Promise<MadrasatiExtractionSuccess<T>>,
  ): Promise<MadrasatiExtractionResult<T>> {
    try {
      return await read();
    } catch (error) {
      return toExtractionFailure(error);
    }
  }

  async getAuthenticationScreenshot(
    userId: string,
    sessionId: string,
  ): Promise<Uint8Array> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    return record.provider.getAuthenticationScreenshot();
  }

  async clickAuthentication(
    userId: string,
    sessionId: string,
    x: number,
    y: number,
  ): Promise<void> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    await record.provider.clickAuthentication(x, y);
  }

  async typeAuthentication(
    userId: string,
    sessionId: string,
    text: string,
  ): Promise<void> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    await record.provider.typeAuthentication(text);
  }

  async pressAuthenticationKey(
    userId: string,
    sessionId: string,
    key: string,
  ): Promise<void> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    await record.provider.pressAuthenticationKey(key);
  }

  async getAuthenticationLiveFrame(
    userId: string,
    sessionId: string,
  ): Promise<MadrasatiLiveFrame> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    return sanitizeLiveFrame(await record.provider.getAuthenticationLiveFrame());
  }

  async inspectAuthenticationFocus(
    userId: string,
    sessionId: string,
  ): Promise<MadrasatiFocusedControl> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    return sanitizeFocusedControl(
      await record.provider.inspectAuthenticationFocus(),
    );
  }

  async waitForAuthenticationLiveFrame(
    userId: string,
    sessionId: string,
    sinceSeq: number,
    timeoutMs = 1500,
  ): Promise<MadrasatiLiveFrameUpdate | null> {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();

    if (!madrasatiLiveFrameHub.getLatest(record.sessionId)) {
      try {
        const frame = await record.provider.getAuthenticationLiveFrame();
        madrasatiLiveFrameHub.publish(record.sessionId, frame);
      } catch {
        // Waiters still fail closed if no frame becomes available.
      }
    }

    const boundedTimeout = Math.min(Math.max(timeoutMs, 250), 2000);

    return madrasatiLiveFrameHub.waitForFrame(
      record.sessionId,
      Number.isFinite(sinceSeq) ? sinceSeq : 0,
      boundedTimeout,
    );
  }

  subscribeAuthenticationLiveFrame(
    userId: string,
    sessionId: string,
    listener: (update: MadrasatiLiveFrameUpdate) => void,
  ): () => void {
    const record = this.requireOwnedSession(userId, sessionId);

    record.lastUsedAt = Date.now();
    this.attachLivePublisher(record);

    return madrasatiLiveFrameHub.subscribe(record.sessionId, listener, {
      replayLatest: true,
    });
  }

  async closeSession(userId: string, sessionId: string): Promise<void> {
    const record = this.requireOwnedSession(userId, sessionId);

    this.detachLivePublisher(record);
    this.sessions.delete(sessionId);

    if (this.sessionsByUser.get(record.userId) === sessionId) {
      this.sessionsByUser.delete(record.userId);
    }

    await record.provider.disconnect();
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now();

    const expired = [...this.sessions.values()].filter(
      (record) => now - record.lastUsedAt >= this.ttlMs,
    );

    for (const record of expired) {
      this.detachLivePublisher(record);
      this.sessions.delete(record.sessionId);

      if (this.sessionsByUser.get(record.userId) === record.sessionId) {
        this.sessionsByUser.delete(record.userId);
      }

      await record.provider.disconnect().catch(() => undefined);
    }
  }

  private requireOwnedSession(
    userId: string,
    sessionId: string,
  ): BrowserSessionRecord {
    const ownerId = this.requireUserId(userId);
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      throw new Error("Madrasati browser session id is required.");
    }

    const record = this.sessions.get(normalizedSessionId);

    if (!record) {
      throw new Error("Madrasati browser session was not found or has expired.");
    }

    if (record.userId !== ownerId) {
      throw new Error("Madrasati browser session does not belong to this user.");
    }

    if (Date.now() - record.lastUsedAt >= this.ttlMs) {
      this.detachLivePublisher(record);
      this.sessions.delete(record.sessionId);

      if (this.sessionsByUser.get(record.userId) === record.sessionId) {
        this.sessionsByUser.delete(record.userId);
      }

      void record.provider.disconnect().catch(() => undefined);

      throw new Error("Madrasati browser session has expired.");
    }

    return record;
  }

  private attachLivePublisher(record: BrowserSessionRecord): void {
    if (record.unsubscribeLive) {
      return;
    }

    record.unsubscribeLive = record.provider.subscribeAuthenticationLiveFrame(
      (frame) => {
        madrasatiLiveFrameHub.publish(record.sessionId, frame);
      },
    );
  }

  private detachLivePublisher(record: BrowserSessionRecord): void {
    record.unsubscribeLive?.();
    record.unsubscribeLive = undefined;
    madrasatiLiveFrameHub.close(record.sessionId);
  }

  private requireUserId(userId: string): string {
    const normalized = userId?.trim();

    if (!normalized) {
      throw new Error("Authenticated Waraqa user id is required.");
    }

    return normalized;
  }

  private toSessionInfo(
    record: BrowserSessionRecord,
  ): MadrasatiBrowserSessionInfo {
    return {
      sessionId: record.sessionId,
      createdAt: new Date(record.createdAt).toISOString(),
      expiresAt: new Date(record.lastUsedAt + this.ttlMs).toISOString(),
    };
  }
}

export const madrasatiBrowserSessionManager =
  new MadrasatiBrowserSessionManager();
