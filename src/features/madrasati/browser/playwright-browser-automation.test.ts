import assert from "node:assert/strict";
import { chromium } from "playwright";
import { test } from "node:test";

import { PlaywrightBrowserAutomation } from "./playwright-browser-automation.server.ts";

test("PlaywrightBrowserAutomation — availability", async () => {
  const automation = new PlaywrightBrowserAutomation();

  await assert.doesNotReject(() => automation.assertAvailable());

  await automation.close();
});

test("PlaywrightBrowserAutomation — opens isolated sessions", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const first = await automation.openSession();
  const second = await automation.openSession();

  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/i);
  assert.match(second.id, /^[0-9a-f-]{36}$/i);

  await automation.closeSession(first);
  await automation.closeSession(second);
  await automation.close();
});

test("PlaywrightBrowserAutomation — each session has an isolated context", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const first = await automation.openSession();
  const second = await automation.openSession();

  // Access the internal session map only from this test so we can
  // prove that contexts are distinct without exposing Playwright types
  // through the application-facing BrowserAutomation interface.
  const sessions = (
    automation as unknown as {
      sessions: Map<string, { context: import("playwright").BrowserContext }>;
    }
  ).sessions;

  const firstContext = sessions.get(first.id)?.context;
  const secondContext = sessions.get(second.id)?.context;

  assert.ok(firstContext);
  assert.ok(secondContext);
  assert.notEqual(firstContext, secondContext);

  assert.equal((await firstContext!.cookies()).length, 0);
  assert.equal((await secondContext!.cookies()).length, 0);

  await automation.close();
});

test("PlaywrightBrowserAutomation — session cookies stay inside the session", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const first = await automation.openSession();
  const second = await automation.openSession();

  const sessions = (
    automation as unknown as {
      sessions: Map<string, { context: import("playwright").BrowserContext }>;
    }
  ).sessions;

  const firstContext = sessions.get(first.id)?.context;
  const secondContext = sessions.get(second.id)?.context;

  assert.ok(firstContext);
  assert.ok(secondContext);

  await firstContext!.addCookies([
    {
      name: "session-test",
      value: "first-only",
      domain: "example.com",
      path: "/",
    },
  ]);

  assert.equal((await firstContext!.cookies("https://example.com")).length, 1);
  assert.equal((await secondContext!.cookies("https://example.com")).length, 0);

  await automation.close();
});

test("PlaywrightBrowserAutomation — closing a session removes it", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();

  const sessions = (
    automation as unknown as {
      sessions: Map<string, unknown>;
    }
  ).sessions;

  assert.equal(sessions.has(session.id), true);

  await automation.closeSession(session);

  assert.equal(sessions.has(session.id), false);

  // Closing an already-closed session is intentionally idempotent.
  await assert.doesNotReject(() => automation.closeSession(session));

  await automation.close();
});

test("PlaywrightBrowserAutomation — session handle contains only opaque id", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();

  assert.deepEqual(Object.keys(session), ["id"]);
  assert.equal(typeof session.id, "string");

  // The handle must not expose browser/context/page/cookies.
  assert.equal("context" in session, false);
  assert.equal("browser" in session, false);
  assert.equal("page" in session, false);
  assert.equal("cookies" in session, false);

  await automation.close();
});

test("PlaywrightBrowserAutomation — browser can navigate inside a session", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();

  const sessions = (
    automation as unknown as {
      sessions: Map<string, { context: import("playwright").BrowserContext }>;
    }
  ).sessions;

  const context = sessions.get(session.id)?.context;

  assert.ok(context);

  const page = await context!.newPage();

  await page.goto("https://example.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  assert.equal(await page.title(), "Example Domain");
  assert.equal(page.url(), "https://example.com/");

  await automation.close();
});

test("PlaywrightBrowserAutomation — captures a page screenshot", async () => {
  const automation = new PlaywrightBrowserAutomation();

  const session = await automation.openSession();
  const page = await automation.openPage(session);

  await automation.goto(page, "https://example.com", {
    waitUntil: "domcontentloaded",
  });

  const screenshot = await automation.getPageScreenshot(page);

  assert.ok(screenshot instanceof Uint8Array);
  assert.ok(screenshot.length > 100);

  // PNG signature.
  assert.deepEqual(
    [...screenshot.slice(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );

  await automation.close();
});

test("PlaywrightBrowserAutomation — kind is playwright", () => {
  const automation = new PlaywrightBrowserAutomation();

  assert.equal(automation.kind, "playwright");
});

test("PlaywrightBrowserAutomation — live view and focus stay cookie-free on a local form", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body style="margin:0">
    <input id="email" style="position:absolute;left:20px;top:20px;width:220px;height:44px" />
    <input id="secret" type="password" style="position:absolute;left:20px;top:80px;width:220px;height:44px" />
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.startPageLiveView(page);
  await automation.clickPage(page, 40, 40);

  const emailFocus = await automation.inspectFocusedControl(page);

  assert.equal(emailFocus.isEditable, true);
  assert.equal(emailFocus.inputType, "text");
  assert.deepEqual(Object.keys(emailFocus).sort(), ["inputType", "isEditable"]);
  assert.equal("value" in emailFocus, false);

  await automation.typePage(page, "teacher@example.com");

  const afterType = await automation.inspectFocusedControl(page);
  assert.equal("value" in afterType, false);

  await automation.clickPage(page, 40, 100);
  const protectedFocus = await automation.inspectFocusedControl(page);
  assert.equal(protectedFocus.isEditable, true);
  assert.equal(protectedFocus.inputType, "protected");
  assert.equal("value" in protectedFocus, false);

  const frame = await automation.getPageLiveFrame(page);
  assert.ok(frame.base64.length > 20);
  assert.ok(frame.mimeType === "image/jpeg" || frame.mimeType === "image/png");
  assert.equal(frame.viewportWidth, 390);
  assert.equal(frame.viewportHeight, 844);
  assert.deepEqual(Object.keys(frame).sort(), [
    "base64",
    "mimeType",
    "viewportHeight",
    "viewportWidth",
  ]);

  await automation.stopPageLiveView(page);
  await automation.close();
});
