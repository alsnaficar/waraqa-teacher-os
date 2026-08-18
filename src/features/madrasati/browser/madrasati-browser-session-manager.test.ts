import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import { MadrasatiBrowserSessionManager } from "./madrasati-browser-session-manager.server.ts";
import type { MadrasatiAuthenticationPage } from "../provider/madrasati-provider.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

class FakeInteractiveAdapter {
  disconnectCalls = 0;
  typed: string[] = [];
  clicks: Array<{ x: number; y: number }> = [];
  liveViewStarted = 0;

  async connect() {
    return {
      state: "connected" as const,
      authenticationState: "not_authenticated" as const,
      message: "connected",
      isMock: false,
      browserAutomationAvailable: true,
    };
  }

  async beginAuthentication() {
    return {
      state: "connected" as const,
      authenticationState: "not_authenticated" as const,
      message: "login opened",
      isMock: false,
      browserAutomationAvailable: true,
    };
  }

  async startAuthenticationLiveView() {
    this.liveViewStarted += 1;
  }

  async inspectAuthenticationPage(): Promise<MadrasatiAuthenticationPage> {
    return {
      url: "https://example.com/login",
      title: "Example login",
      text: "Sign in",
      authenticationState: "not_authenticated",
    };
  }

  async getAuthenticationScreenshot() {
    return new Uint8Array([137, 80, 78, 71]);
  }

  async getAuthenticationLiveFrame(): Promise<MadrasatiLiveFrame & { cookies?: string }> {
    return {
      mimeType: "image/jpeg",
      base64: "abc123",
      viewportWidth: 390,
      viewportHeight: 844,
      cookies: "must-not-leave-server",
    };
  }

  async inspectAuthenticationFocus(): Promise<
    MadrasatiFocusedControl & { value?: string }
  > {
    return {
      isEditable: true,
      inputType: "text",
      value: "must-not-leave-server",
    };
  }

  async getTeacherProfile() {
    return {
      displayName: "معلم الاختبار",
      schoolName: "مدرسة الاختبار الأهلية",
    };
  }

  async clickAuthentication(x: number, y: number) {
    this.clicks.push({ x, y });
  }

  async typeAuthentication(text: string) {
    this.typed.push(text);
  }

  async pressAuthenticationKey(_key: string) {}

  subscribeAuthenticationLiveFrame(
    _listener: (frame: MadrasatiLiveFrame) => void,
  ) {
    return () => undefined;
  }

  async disconnect() {
    this.disconnectCalls += 1;
  }
}

function createManager(adapter = new FakeInteractiveAdapter()) {
  return {
    adapter,
    manager: new MadrasatiBrowserSessionManager({
      createProvider: () => adapter as unknown as MadrasatiBrowserAdapter,
    }),
  };
}

describe("Madrasati browser session manager — lifecycle and ownership", () => {
  it("starts an isolated session and reuses it for the same user", async () => {
    const { adapter, manager } = createManager();

    const first = await manager.startAuthentication(USER_A);
    const second = await manager.startAuthentication(USER_A);

    assert.equal(first.session.sessionId, second.session.sessionId);
    assert.match(first.session.sessionId, /^[0-9a-f-]{36}$/i);
    assert.equal(first.url, "https://example.com/login");
    assert.ok(adapter.liveViewStarted >= 1);
  });

  it("rejects missing user and session identifiers fail-closed", async () => {
    const { manager } = createManager();

    await assert.rejects(() => manager.startAuthentication("  "), /user id/i);
    await assert.rejects(
      () => manager.inspectAuthentication(USER_A, ""),
      /session id/i,
    );
  });

  it("does not allow another user to inspect, stream, type, or close a session", async () => {
    const { manager } = createManager();
    const started = await manager.startAuthentication(USER_A);

    await assert.rejects(
      () => manager.inspectAuthentication(USER_B, started.session.sessionId),
      /does not belong/,
    );
    await assert.rejects(
      () =>
        manager.getAuthenticationLiveFrame(USER_B, started.session.sessionId),
      /does not belong/,
    );
    await assert.rejects(
      () =>
        manager.inspectAuthenticationFocus(USER_B, started.session.sessionId),
      /does not belong/,
    );
    await assert.rejects(
      () =>
        manager.clickAuthentication(USER_B, started.session.sessionId, 10, 10),
      /does not belong/,
    );
    await assert.rejects(
      () =>
        manager.typeAuthentication(USER_B, started.session.sessionId, "abc"),
      /does not belong/,
    );
    await assert.rejects(
      () => manager.closeSession(USER_B, started.session.sessionId),
      /does not belong/,
    );
  });

  it("owner can stream a sanitized live frame and sanitized focus metadata", async () => {
    const { manager } = createManager();
    const started = await manager.startAuthentication(USER_A);

    const frame = await manager.getAuthenticationLiveFrame(
      USER_A,
      started.session.sessionId,
    );
    const focus = await manager.inspectAuthenticationFocus(
      USER_A,
      started.session.sessionId,
    );

    assert.deepEqual(Object.keys(frame).sort(), [
      "base64",
      "mimeType",
      "viewportHeight",
      "viewportWidth",
    ]);
    assert.equal("cookies" in frame, false);
    assert.deepEqual(focus, { isEditable: true, inputType: "text" });
    assert.equal("value" in focus, false);
  });

  it("closes the owned session and rejects later use", async () => {
    const { adapter, manager } = createManager();
    const started = await manager.startAuthentication(USER_A);

    await manager.closeSession(USER_A, started.session.sessionId);

    assert.equal(adapter.disconnectCalls, 1);
    assert.equal(
      (await import("./madrasati-browser-live-session.ts")).madrasatiLiveFrameHub.subscriberCount(
        started.session.sessionId,
      ),
      0,
    );
    await assert.rejects(
      () => manager.inspectAuthentication(USER_A, started.session.sessionId),
      /not found|expired/i,
    );
  });

  it("expires idle sessions fail-closed and disconnects them", async () => {
    const adapter = new FakeInteractiveAdapter();
    const manager = new MadrasatiBrowserSessionManager({
      ttlMs: 20,
      createProvider: () => adapter as unknown as MadrasatiBrowserAdapter,
    });

    const started = await manager.startAuthentication(USER_A);

    await new Promise((resolve) => setTimeout(resolve, 30));

    await assert.rejects(
      () => manager.inspectAuthentication(USER_A, started.session.sessionId),
      /expired/i,
    );
    assert.equal(adapter.disconnectCalls, 1);
  });

  it("does not allow another user to wait for or subscribe to live frames", async () => {
    const { manager } = createManager();
    const started = await manager.startAuthentication(USER_A);

    await assert.rejects(
      () =>
        manager.waitForAuthenticationLiveFrame(
          USER_B,
          started.session.sessionId,
          0,
          250,
        ),
      /does not belong/,
    );
    assert.throws(
      () =>
        manager.subscribeAuthenticationLiveFrame(
          USER_B,
          started.session.sessionId,
          () => undefined,
        ),
      /does not belong/,
    );
  });

  it("owner waitForLiveFrame returns a sanitized published frame", async () => {
    const { manager } = createManager();
    const started = await manager.startAuthentication(USER_A);
    const pending = manager.waitForAuthenticationLiveFrame(
      USER_A,
      started.session.sessionId,
      0,
      400,
    );

    const update = await pending;
    assert.ok(update);
    assert.equal(typeof update?.seq, "number");
    assert.deepEqual(Object.keys(update!.frame).sort(), [
      "base64",
      "mimeType",
      "viewportHeight",
      "viewportWidth",
    ]);
    assert.equal("cookies" in update!.frame, false);
  });

  it("owner peek reports session presence without page text", async () => {
    const { manager } = createManager();

    const empty = await manager.peekAuthentication(USER_A);
    assert.deepEqual(empty, {
      hasSession: false,
      authenticationState: "not_authenticated",
    });

    await manager.startAuthentication(USER_A);
    const owned = await manager.peekAuthentication(USER_A);

    assert.deepEqual(owned, {
      hasSession: true,
      authenticationState: "not_authenticated",
    });
    assert.deepEqual(Object.keys(owned).sort(), [
      "authenticationState",
      "hasSession",
    ]);

    const other = await manager.peekAuthentication(USER_B);
    assert.deepEqual(other, {
      hasSession: false,
      authenticationState: "not_authenticated",
    });
  });

  it("owner can read a teacher profile without HTML or cookies", async () => {
    const { manager } = createManager();

    await assert.rejects(() => manager.readTeacherProfile(USER_A), /not found|expired/i);

    await manager.startAuthentication(USER_A);
    const teacher = await manager.readTeacherProfile(USER_A);

    assert.equal(teacher.displayName, "معلم الاختبار");
    assert.equal(teacher.schoolName, "مدرسة الاختبار الأهلية");
    assert.equal("html" in teacher, false);
    assert.equal("cookies" in teacher, false);
    await assert.rejects(() => manager.readTeacherProfile(USER_B), /not found|expired/i);
  });

  it("gives each Waraqa user a different session id", async () => {
    const manager = new MadrasatiBrowserSessionManager({
      createProvider: () =>
        new FakeInteractiveAdapter() as unknown as MadrasatiBrowserAdapter,
    });

    const first = await manager.startAuthentication(USER_A);
    const second = await manager.startAuthentication(USER_B);

    assert.notEqual(first.session.sessionId, second.session.sessionId);
  });
});
