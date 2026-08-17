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
