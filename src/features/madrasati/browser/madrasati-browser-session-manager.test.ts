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
  connectCalls = 0;
  typed: string[] = [];
  clicks: Array<{ x: number; y: number }> = [];
  liveViewStarted = 0;
  authenticated = false;
  isMock = false;
  timetableError: Error | null = null;
  emptyClasses = false;
  emptySubjects = false;
  emptyTimetable = false;

  async connect() {
    this.connectCalls += 1;
    return {
      state: "connected" as const,
      authenticationState: "not_authenticated" as const,
      message: "connected",
      isMock: this.isMock,
      browserAutomationAvailable: true,
    };
  }

  async getConnectionStatus() {
    return {
      state: "connected" as const,
      authenticationState: this.authenticated
        ? ("authenticated" as const)
        : ("not_authenticated" as const),
      message: "connected",
      isMock: this.isMock,
      browserAutomationAvailable: !this.isMock,
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
    if (this.authenticated) {
      return {
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: "جدولي\nالمقررات\nالواجبات\nتسجيل الخروج",
        authenticationState: "authenticated",
      };
    }

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

  async getClasses() {
    if (this.emptyClasses) {
      return [];
    }

    return [
      { grade: "الصف الأول المتوسط", className: "1", stage: "intermediate" },
      { grade: "الصف الأول المتوسط", className: "2", stage: "intermediate" },
    ];
  }

  async getSubjects() {
    if (this.emptySubjects) {
      return [];
    }

    return [{ name: "الرياضيات" }, { name: "العلوم" }];
  }

  async getTimetable() {
    if (this.timetableError) {
      throw this.timetableError;
    }

    if (this.emptyTimetable) {
      return [];
    }

    return [
      {
        dayOfWeek: 0,
        period: 1,
        subject: "الرياضيات",
        grade: "الصف الأول المتوسط",
        className: "1",
      },
    ];
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

  it("owner can read assigned classes without HTML or cookies", async () => {
    const { adapter, manager } = createManager();

    await assert.rejects(() => manager.readClasses(USER_A), /not found|expired/i);

    await manager.startAuthentication(USER_A);
    const classes = await manager.readClasses(USER_A);

    assert.equal(classes.length, 2);
    assert.equal(classes[0]?.grade, "الصف الأول المتوسط");
    assert.equal(classes[0]?.className, "1");
    assert.equal(classes[1]?.className, "2");
    assert.equal("html" in (classes[0] ?? {}), false);
    assert.equal("cookies" in (classes[0] ?? {}), false);
    await assert.rejects(() => manager.readClasses(USER_B), /not found|expired/i);
    assert.equal(adapter.disconnectCalls, 0);
  });

  it("owner can read assigned subjects without HTML or cookies", async () => {
    const { adapter, manager } = createManager();

    await assert.rejects(() => manager.readSubjects(USER_A), /not found|expired/i);

    await manager.startAuthentication(USER_A);
    const subjects = await manager.readSubjects(USER_A);

    assert.deepEqual(
      subjects.map((item) => item.name),
      ["الرياضيات", "العلوم"],
    );
    assert.equal("html" in (subjects[0] ?? {}), false);
    assert.equal("cookies" in (subjects[0] ?? {}), false);
    await assert.rejects(() => manager.readSubjects(USER_B), /not found|expired/i);
    assert.equal(adapter.disconnectCalls, 0);
  });

  it("owner can read the timetable without HTML or cookies", async () => {
    const { adapter, manager } = createManager();

    await assert.rejects(() => manager.readTimetable(USER_A), /not found|expired/i);

    await manager.startAuthentication(USER_A);
    const timetable = await manager.readTimetable(USER_A);

    assert.equal(timetable.length, 1);
    assert.equal(timetable[0]?.dayOfWeek, 0);
    assert.equal(timetable[0]?.period, 1);
    assert.equal(timetable[0]?.subject, "الرياضيات");
    assert.equal(timetable[0]?.grade, "الصف الأول المتوسط");
    assert.equal(timetable[0]?.className, "1");
    assert.equal("html" in (timetable[0] ?? {}), false);
    assert.equal("cookies" in (timetable[0] ?? {}), false);
    await assert.rejects(() => manager.readTimetable(USER_B), /not found|expired/i);
    assert.equal(adapter.disconnectCalls, 0);
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

  it("live verification reuses the owned session and does not create another", async () => {
    const { adapter, manager } = createManager();

    const missing = await manager.verifyLiveExtraction(USER_A);
    assert.equal(missing.session.existedBefore, false);
    assert.equal(missing.teacher.success, false);
    assert.equal(adapter.connectCalls, 0);
    assert.equal(adapter.disconnectCalls, 0);

    await manager.startAuthentication(USER_A);
    adapter.authenticated = true;
    const connectsAfterStart = adapter.connectCalls;

    const report = await manager.verifyLiveExtraction(USER_A);

    assert.equal(report.connection, "LIVE");
    assert.equal(report.isMock, false);
    assert.equal(report.stoppedBecauseMock, false);
    assert.equal(report.authenticated, true);
    assert.equal(report.teacher.success, true);
    if (report.teacher.success) {
      assert.equal(report.teacher.data.displayName, "معلم الاختبار");
      assert.equal(report.teacher.data.schoolName, "مدرسة الاختبار الأهلية");
    }
    assert.equal(report.classes.success, true);
    assert.equal(report.subjects.success, true);
    assert.equal(report.timetable.success, true);
    if (report.timetable.success) {
      assert.equal(report.timetable.data.length, 1);
      assert.equal("startsAt" in report.timetable.data[0]!, false);
    }
    assert.equal(report.timetableValidation.duplicateCount, 0);
    assert.equal(report.session.existedBefore, true);
    assert.equal(report.session.remainedAlive, true);
    assert.equal(report.session.remainedAuthenticated, true);
    assert.equal(report.session.secondSessionCreated, false);
    assert.equal(report.databaseWrites, "NONE");
    assert.equal(adapter.connectCalls, connectsAfterStart);
    assert.equal(adapter.disconnectCalls, 0);
    assert.equal("html" in report, false);
    assert.equal("cookies" in report, false);
    assert.equal("text" in report, false);
  });

  it("live verification stops when the connection is mock", async () => {
    const { adapter, manager } = createManager();
    adapter.isMock = true;
    await manager.startAuthentication(USER_A);
    adapter.authenticated = true;
    const connects = adapter.connectCalls;

    const report = await manager.verifyLiveExtraction(USER_A);
    assert.equal(report.connection, "MOCK");
    assert.equal(report.stoppedBecauseMock, true);
    assert.equal(report.teacher.success, false);
    if (!report.teacher.success) {
      assert.equal(report.teacher.message, "LIVE MADRASATI SESSION WAS NOT USED.");
    }
    assert.equal(adapter.connectCalls, connects);
    assert.equal(adapter.disconnectCalls, 0);
  });

  it("live verification isolates a timetable failure without closing the session", async () => {
    const { adapter, manager } = createManager();
    await manager.startAuthentication(USER_A);
    adapter.authenticated = true;
    adapter.timetableError = new Error("تعذر قراءة الجدول من صفحة جدولي في مدرستي.");

    const report = await manager.verifyLiveExtraction(USER_A);
    assert.equal(report.teacher.success, true);
    assert.equal(report.classes.success, true);
    assert.equal(report.subjects.success, true);
    assert.equal(report.timetable.success, false);
    if (!report.timetable.success) {
      assert.match(report.timetable.message, /تعذر قراءة الجدول/);
    }
    assert.equal(adapter.disconnectCalls, 0);
    assert.equal(report.session.remainedAlive, true);
  });

  it("live verification treats a confirmed empty catalog as success, not a scraper failure", async () => {
    const { adapter, manager } = createManager();
    await manager.startAuthentication(USER_A);
    adapter.authenticated = true;
    adapter.emptyClasses = true;
    adapter.emptySubjects = true;
    adapter.emptyTimetable = true;

    const report = await manager.verifyLiveExtraction(USER_A);
    assert.equal(report.classes.success, true);
    assert.equal(report.classes.empty, true);
    assert.equal(report.subjects.success, true);
    assert.equal(report.subjects.empty, true);
    assert.equal(report.timetable.success, true);
    assert.equal(report.timetable.empty, true);
    assert.equal(adapter.disconnectCalls, 0);
  });
});
