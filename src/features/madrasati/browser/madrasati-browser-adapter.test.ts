import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
  BrowserSessionOpenOptions,
} from "./browser-automation.ts";
import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import { PlaywrightBrowserAutomation } from "./playwright-browser-automation.server.ts";
import type {
  MadrasatiFocusedControl,
  MadrasatiLiveFrame,
} from "./madrasati-browser-live-session.ts";

class FakeBrowserAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private sessionOpen = false;
  private pageOpen = false;

  async assertAvailable(): Promise<void> {}

  async openSession(
    _options?: BrowserSessionOpenOptions,
  ): Promise<BrowserSessionHandle> {
    this.sessionOpen = true;
    return Object.freeze({ id: "test-session" });
  }

  async closeSession(_session: BrowserSessionHandle): Promise<void> {
    this.sessionOpen = false;
  }

  async openPage(
    _session: BrowserSessionHandle,
  ): Promise<BrowserPageHandle> {
    assert.equal(this.sessionOpen, true);
    this.pageOpen = true;
    return Object.freeze({ id: "test-page" });
  }

  async closePage(_page: BrowserPageHandle): Promise<void> {
    this.pageOpen = false;
  }

  async goto(
    _page: BrowserPageHandle,
    url: string,
  ): Promise<void> {
    assert.equal(this.pageOpen, true);
    assert.match(url, /^https:\/\/schools\.madrasati\.sa\//);
  }

  async getPageUrl(_page: BrowserPageHandle): Promise<string> {
    return "https://schools.madrasati.sa/";
  }

  async getPageTitle(_page: BrowserPageHandle): Promise<string> {
    return "مدرستي";
  }

  async getPageText(_page: BrowserPageHandle): Promise<string> {
    return "مدرستي";
  }

  async getPageScreenshot(_page: BrowserPageHandle): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71]);
  }

  async clickPage(
    _page: BrowserPageHandle,
    _x: number,
    _y: number,
  ): Promise<void> {}

  async typePage(
    _page: BrowserPageHandle,
    _text: string,
  ): Promise<void> {}

  async pressPageKey(
    _page: BrowserPageHandle,
    _key: string,
  ): Promise<void> {}

  async startPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async stopPageLiveView(_page: BrowserPageHandle): Promise<void> {}

  async getPageLiveFrame(_page: BrowserPageHandle): Promise<MadrasatiLiveFrame> {
    return {
      mimeType: "image/jpeg",
      base64: "AAAA",
      viewportWidth: 390,
      viewportHeight: 844,
    };
  }

  async inspectFocusedControl(
    _page: BrowserPageHandle,
  ): Promise<MadrasatiFocusedControl> {
    return { isEditable: false, inputType: "none" };
  }

  async readPageLandmarks(_page: BrowserPageHandle) {
    return {
      url: await this.getPageUrl(_page),
      title: await this.getPageTitle(_page),
      text: await this.getPageText(_page),
      accessibleNames: [] as string[],
      labeledValues: [] as Array<{ label: string; value: string }>,
    };
  }

  async clickControlByAccessibleName(
    _page: BrowserPageHandle,
    _names: readonly string[],
  ): Promise<boolean> {
    return false;
  }

  async waitForPageText(
    _page: BrowserPageHandle,
    _needle: string,
    _timeoutMs?: number,
  ): Promise<boolean> {
    return false;
  }

  subscribePageLiveFrame(
    _page: BrowserPageHandle,
    _listener: (frame: MadrasatiLiveFrame) => void,
  ): () => void {
    return () => undefined;
  }
}

test("MadrasatiBrowserAdapter — reports browser availability without opening a session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const statusBefore = await provider.getConnectionStatus();

  assert.equal(statusBefore.state, "not_implemented");
  assert.equal(statusBefore.browserAutomationAvailable, true);
  assert.equal(statusBefore.isMock, false);
});

test("MadrasatiBrowserAdapter — connect opens Madrasati session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const status = await provider.connect();

  assert.equal(status.state, "connected");
  assert.equal(status.browserAutomationAvailable, true);
  assert.equal(status.isMock, false);
  assert.match(
    status.message,
    /تم فتح جلسة متصفح الخادم/,
  );
});

test("MadrasatiBrowserAdapter — disconnect closes the browser session", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  const connected = await provider.connect();
  assert.equal(connected.state, "connected");

  const disconnected = await provider.disconnect();

  assert.equal(disconnected.state, "disconnected");
  assert.equal(disconnected.browserAutomationAvailable, true);
  assert.equal(disconnected.isMock, false);
});

test("MadrasatiBrowserAdapter — beginAuthentication exposes sanitized live frame and focus", async () => {
  const automation = new FakeBrowserAutomation();
  const provider = new MadrasatiBrowserAdapter(automation);

  await provider.connect();
  const status = await provider.beginAuthentication();

  assert.equal(status.state, "connected");
  assert.equal(status.isMock, false);

  const frame = await provider.getAuthenticationLiveFrame();
  assert.equal(frame.mimeType, "image/jpeg");
  assert.equal("cookies" in frame, false);

  const focus = await provider.inspectAuthenticationFocus();
  assert.deepEqual(Object.keys(focus).sort(), ["inputType", "isEditable"]);
});

test("MadrasatiBrowserAdapter — reads teacher profile from authenticated home landmarks", async () => {
  class TeacherHomeAutomation extends FakeBrowserAutomation {
    async getPageText(): Promise<string> {
      return "مرحباً، معلم الاختبار\nجدولي\nالمقررات والمصادر\nالواجبات";
    }

    async readPageLandmarks() {
      return {
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: await this.getPageText(),
        accessibleNames: ["جدولي", "المقررات والمصادر", "تسجيل الخروج"],
        labeledValues: [
          { label: "المدرسة", value: "مدرسة الاختبار الأهلية" },
          { label: "العام الدراسي", value: "1447" },
          { label: "الفصل الدراسي", value: "الأول" },
        ],
      };
    }
  }

  const provider = new MadrasatiBrowserAdapter(new TeacherHomeAutomation());
  await provider.connect();

  const teacher = await provider.getTeacherProfile();
  assert.equal(teacher.displayName, "معلم الاختبار");
  assert.equal(teacher.schoolName, "مدرسة الاختبار الأهلية");
  assert.equal(teacher.academicYear, "1447");
  assert.equal(teacher.semester, "1");

  await assert.rejects(
    () => provider.getTimetable(),
    /قراءة الجدول لم تُنفّذ بعد/,
  );
});

test("Playwright boundary — page lifecycle through opaque handles", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();
  const page = await automation.openPage(session);

  assert.equal(Object.keys(session).length, 1);
  assert.equal(Object.keys(page).length, 1);

  assert.equal(typeof session.id, "string");
  assert.equal(typeof page.id, "string");

  await automation.goto(page, "https://example.com", {
    waitUntil: "domcontentloaded",
  });

  assert.equal(
    await automation.getPageTitle(page),
    "Example Domain",
  );

  assert.equal(
    await automation.getPageUrl(page),
    "https://example.com/",
  );

  await automation.closePage(page);
  await automation.closeSession(session);
  await automation.close();
});
