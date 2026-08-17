import { randomUUID } from "node:crypto";
import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import {
  PlaywrightBrowserAutomation,
} from "./playwright-browser-automation.server.ts";
import type { MadrasatiAuthenticationPage } from "../provider/madrasati-provider.ts";

const SESSION_TTL_MS = 15 * 60 * 1000;

type BrowserSessionRecord = {
  readonly sessionId: string;
  readonly userId: string;
  readonly provider: MadrasatiBrowserAdapter;
  readonly createdAt: number;
  lastUsedAt: number;
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

class MadrasatiBrowserSessionManager {
  private readonly automation = new PlaywrightBrowserAutomation();

  private readonly sessions = new Map<string, BrowserSessionRecord>();

  private readonly sessionsByUser = new Map<string, string>();

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

    const provider = new MadrasatiBrowserAdapter(this.automation);

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

  async closeSession(userId: string, sessionId: string): Promise<void> {
    const record = this.requireOwnedSession(userId, sessionId);

    this.sessions.delete(sessionId);

    if (this.sessionsByUser.get(record.userId) === sessionId) {
      this.sessionsByUser.delete(record.userId);
    }

    await record.provider.disconnect();
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now();

    const expired = [...this.sessions.values()].filter(
      (record) => now - record.lastUsedAt >= SESSION_TTL_MS,
    );

    for (const record of expired) {
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

    if (Date.now() - record.lastUsedAt >= SESSION_TTL_MS) {
      this.sessions.delete(record.sessionId);

      if (this.sessionsByUser.get(record.userId) === record.sessionId) {
        this.sessionsByUser.delete(record.userId);
      }

      void record.provider.disconnect().catch(() => undefined);

      throw new Error("Madrasati browser session has expired.");
    }

    return record;
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
      expiresAt: new Date(record.lastUsedAt + SESSION_TTL_MS).toISOString(),
    };
  }
}

export const madrasatiBrowserSessionManager =
  new MadrasatiBrowserSessionManager();
