import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BrowserAutomation,
  BrowserPageHandle,
  BrowserSessionHandle,
} from "./browser-automation.ts";
import { MadrasatiBrowserAdapter } from "./madrasati-browser-adapter.server.ts";
import { PlaywrightBrowserAutomation } from "./playwright-browser-automation.server.ts";

class FakeBrowserAutomation implements BrowserAutomation {
  readonly kind = "playwright" as const;

  private sessionOpen = false;
  private pageOpen = false;

  async assertAvailable(): Promise<void> {}

  async openSession(): Promise<BrowserSessionHandle> {
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
    assert.equal(url, "https://schools.madrasati.sa/");
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
