import assert from "node:assert/strict";
import { chromium } from "playwright";
import { test } from "node:test";

import { PlaywrightBrowserAutomation } from "./playwright-browser-automation.server.ts";

function getAutomationPage(
  automation: PlaywrightBrowserAutomation,
  page: { id: string },
): import("playwright").Page {
  const sessions = (
    automation as unknown as {
      sessions: Map<string, { pages: Map<string, import("playwright").Page> }>;
    }
  ).sessions;

  for (const record of sessions.values()) {
    const pageObject = record.pages.get(page.id);

    if (pageObject) {
      return pageObject;
    }
  }

  throw new Error("Playwright page is unavailable.");
}

function assertSanitizedFocus(focus: object): void {
  assert.deepEqual(Object.keys(focus).sort(), ["inputType", "isEditable"]);
  assert.equal("value" in focus, false);
  assert.equal("password" in focus, false);
  assert.equal("html" in focus, false);
}

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

test("PlaywrightBrowserAutomation — focuses a local email field then clicks Next", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="email" type="email" aria-label="Enter your email" />
    <input id="secret" type="password" aria-label="Password" />
    <button type="button" id="next">Next</button>
    <p id="status">idle</p>
    <script>
      document.getElementById("next").addEventListener("click", () => {
        document.getElementById("status").textContent = "next";
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "email");
  assert.equal("value" in focus, false);

  await automation.typePage(page, "teacher@example.com");

  const sessions = (
    automation as unknown as {
      sessions: Map<string, { pages: Map<string, import("playwright").Page> }>;
    }
  ).sessions;

  let pageObject: import("playwright").Page | undefined;

  for (const record of sessions.values()) {
    pageObject = record.pages.get(page.id);
    if (pageObject) {
      break;
    }
  }

  assert.ok(pageObject);
  assert.equal(await pageObject.locator("#email").inputValue(), "teacher@example.com");
  assert.equal(await pageObject.locator("#secret").inputValue(), "");

  const clicked = await automation.clickControlByAccessibleName(page, [
    "Next",
    "التالي",
  ]);
  assert.equal(clicked, true);
  assert.equal(await pageObject.locator("#status").innerText(), "next");

  await automation.close();
});

test("PlaywrightBrowserAutomation — focuses a protected password field and types without reading its value", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="secret" type="password" aria-label="Password" />
    <p id="typed-length">0</p>
    <script>
      document.getElementById("secret").addEventListener("input", (event) => {
        const field = event.target;
        document.getElementById("typed-length").textContent = String(
          field && "value" in field ? field.value.length : 0,
        );
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "protected");
  assert.deepEqual(Object.keys(focus).sort(), ["inputType", "isEditable"]);
  assert.equal("value" in focus, false);

  const secret = "pw-sample-12";
  await automation.typePage(page, secret);

  const afterType = await automation.inspectFocusedControl(page);
  assert.equal(afterType.isEditable, true);
  assert.equal(afterType.inputType, "protected");
  assert.equal("value" in afterType, false);

  const sessions = (
    automation as unknown as {
      sessions: Map<string, { pages: Map<string, import("playwright").Page> }>;
    }
  ).sessions;

  let pageObject: import("playwright").Page | undefined;

  for (const record of sessions.values()) {
    pageObject = record.pages.get(page.id);
    if (pageObject) {
      break;
    }
  }

  assert.ok(pageObject);
  assert.equal(await pageObject.locator("#typed-length").innerText(), String(secret.length));

  await automation.close();
});

test("PlaywrightBrowserAutomation — keeps a focused password field instead of stealing email focus", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="email" type="email" aria-label="Enter your email" />
    <input id="secret" type="password" aria-label="Password" />
    <p id="typed-length">0</p>
    <script>
      document.getElementById("secret").addEventListener("input", (event) => {
        const field = event.target;
        document.getElementById("typed-length").textContent = String(
          field && "value" in field ? field.value.length : 0,
        );
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  const sessions = (
    automation as unknown as {
      sessions: Map<string, { pages: Map<string, import("playwright").Page> }>;
    }
  ).sessions;

  let pageObject: import("playwright").Page | undefined;

  for (const record of sessions.values()) {
    pageObject = record.pages.get(page.id);
    if (pageObject) {
      break;
    }
  }

  assert.ok(pageObject);
  await pageObject.locator("#secret").focus();

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "protected");
  assert.equal("value" in focus, false);

  const secret = "keep-focus";
  await automation.typePage(page, secret);

  assert.equal(await pageObject.locator("#email").inputValue(), "");
  assert.equal(await pageObject.locator("#typed-length").innerText(), String(secret.length));

  const afterType = await automation.inspectFocusedControl(page);
  assert.equal("value" in afterType, false);

  await automation.close();
});

test("PlaywrightBrowserAutomation — hidden leftover email does not steal visible password typing", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  try {
    const html = `<!doctype html><html><body>
    <input id="email" type="email" name="loginfmt" value="teacher@example.com" />
    <input id="secret" type="password" aria-label="Password" />
    <p id="typed-length">0</p>
    <script>
      const email = document.getElementById("email");
      email.focus();
      email.style.display = "none";
      document.getElementById("secret").addEventListener("input", (event) => {
        const field = event.target;
        document.getElementById("typed-length").textContent = String(
          field && "value" in field ? field.value.length : 0,
        );
      });
    </script>
  </body></html>`;

    await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
      waitUntil: "domcontentloaded",
    });

    const pageObject = getAutomationPage(automation, page);
    const leftoverEmail = await pageObject.locator("#email").inputValue();

    await automation.focusEditableControl(page);

    const beforeType = await automation.inspectFocusedControl(page);
    assert.equal(beforeType.isEditable, true);
    assert.equal(beforeType.inputType, "protected");
    assertSanitizedFocus(beforeType);

    await automation.typePage(page, "dummy-secret");

    const typedLength = Number(
      await pageObject.locator("#typed-length").innerText(),
    );
    assert.ok(typedLength > 0);
    assert.equal(await pageObject.locator("#email").inputValue(), leftoverEmail);

    const afterType = await automation.inspectFocusedControl(page);
    assert.equal(afterType.isEditable, true);
    assert.equal(afterType.inputType, "protected");
    assertSanitizedFocus(afterType);
  } finally {
    await automation.close();
  }
});

test("PlaywrightBrowserAutomation — visible email stays preferred when password is also visible", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="email" type="email" aria-label="Enter your email" />
    <input id="secret" type="password" aria-label="Password" />
    <p id="password-length">0</p>
    <script>
      document.getElementById("secret").addEventListener("input", (event) => {
        const field = event.target;
        document.getElementById("password-length").textContent = String(
          field && "value" in field ? field.value.length : 0,
        );
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "email");
  assertSanitizedFocus(focus);

  await automation.typePage(page, "teacher@example.com");

  const pageObject = getAutomationPage(automation, page);
  assert.equal(await pageObject.locator("#email").inputValue(), "teacher@example.com");
  assert.equal(await pageObject.locator("#password-length").innerText(), "0");
  assertSanitizedFocus(await automation.inspectFocusedControl(page));

  await automation.close();
});

test("PlaywrightBrowserAutomation — types into an iframe password while parent email stays leftover", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);
  const dir = mkdtempSync(join(tmpdir(), "madrasati-password-frame-"));

  writeFileSync(
    join(dir, "child.html"),
    `<!doctype html><html><body>
      <input id="secret" type="password" aria-label="Password" />
      <p id="typed-length">0</p>
      <script>
        document.getElementById("secret").addEventListener("input", (event) => {
          const field = event.target;
          document.getElementById("typed-length").textContent = String(
            field && "value" in field ? field.value.length : 0,
          );
        });
      </script>
    </body></html>`,
    "utf8",
  );
  writeFileSync(
    join(dir, "parent.html"),
    `<!doctype html><html><body>
      <input id="email" type="email" name="loginfmt" value="teacher@example.com" />
      <iframe id="login-frame" src="child.html"></iframe>
      <script>
        const email = document.getElementById("email");
        email.focus();
        email.style.display = "none";
      </script>
    </body></html>`,
    "utf8",
  );

  await automation.goto(page, `file://${join(dir, "parent.html")}`, {
    waitUntil: "domcontentloaded",
  });

  const pageObject = getAutomationPage(automation, page);
  const frame = pageObject.frameLocator("#login-frame");
  await frame.locator("#secret").waitFor({ state: "visible" });

  const leftoverEmail = await pageObject.locator("#email").inputValue();

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "protected");
  assertSanitizedFocus(focus);

  await automation.typePage(page, "dummy-secret");

  const typedLength = Number(await frame.locator("#typed-length").innerText());
  assert.ok(typedLength > 0);
  assert.equal(await pageObject.locator("#email").inputValue(), leftoverEmail);
  assertSanitizedFocus(await automation.inspectFocusedControl(page));

  await automation.close();
});

test("PlaywrightBrowserAutomation — clicks a readonly password so it becomes typable", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="secret" type="password" readonly aria-label="Password" />
    <p id="typed-length">0</p>
    <script>
      const field = document.getElementById("secret");
      function unlock() {
        field.removeAttribute("readonly");
      }
      field.addEventListener("pointerdown", unlock);
      field.addEventListener("mousedown", unlock);
      field.addEventListener("click", unlock);
      field.addEventListener("input", (event) => {
        const target = event.target;
        document.getElementById("typed-length").textContent = String(
          target && "value" in target ? target.value.length : 0,
        );
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.focusEditableControl(page);

  const focus = await automation.inspectFocusedControl(page);
  assert.equal(focus.isEditable, true);
  assert.equal(focus.inputType, "protected");
  assertSanitizedFocus(focus);

  await automation.typePage(page, "dummy-secret");

  const pageObject = getAutomationPage(automation, page);
  const typedLength = Number(await pageObject.locator("#typed-length").innerText());
  assert.ok(typedLength > 0);
  assertSanitizedFocus(await automation.inspectFocusedControl(page));

  await automation.close();
});

test("PlaywrightBrowserAutomation — password typing appends overlay chunks instead of replacing them", async () => {
  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html><body>
    <input id="secret" type="password" aria-label="Password" />
    <p id="typed-length">0</p>
    <script>
      document.getElementById("secret").addEventListener("input", (event) => {
        const field = event.target;
        document.getElementById("typed-length").textContent = String(
          field && "value" in field ? field.value.length : 0,
        );
      });
    </script>
  </body></html>`;

  await automation.goto(page, `data:text/html,${encodeURIComponent(html)}`, {
    waitUntil: "domcontentloaded",
  });

  await automation.focusEditableControl(page);
  await automation.typePage(page, "a");
  await automation.focusEditableControl(page);
  await automation.typePage(page, "b");

  const pageObject = getAutomationPage(automation, page);
  assert.equal(await pageObject.locator("#typed-length").innerText(), "2");
  assertSanitizedFocus(await automation.inspectFocusedControl(page));

  await automation.close();
});

test("PlaywrightBrowserAutomation — teacher home landmarks do not include HTML or cookies", async () => {
  const { extractMadrasatiTeacher } = await import("./madrasati-teacher-profile.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  const html = `<!doctype html><html lang="ar" dir="rtl"><body>
    <header>
      <button type="button" aria-label="الملف الشخصي">مرحباً، معلم الاختبار</button>
    </header>
    <nav>
      <a href="#">الرئيسية</a>
      <a href="#">جدولي</a>
      <a href="#">المقررات والمصادر</a>
      <a href="#">الواجبات</a>
    </nav>
    <dl>
      <dt>المدرسة</dt>
      <dd>مدرسة الاختبار الأهلية</dd>
      <dt>العام الدراسي</dt>
      <dd>1447</dd>
      <dt>الفصل الدراسي</dt>
      <dd>الأول</dd>
    </dl>
  </body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "madrasati-teacher-home-"));
  const file = join(dir, "home.html");
  writeFileSync(file, html, "utf8");

  await automation.goto(page, `file://${file}`, {
    waitUntil: "domcontentloaded",
  });

  const appeared = await automation.waitForPageText(page, "معلم الاختبار", 5000);
  assert.equal(appeared, true);

  const landmarks = await automation.readPageLandmarks(page);
  assert.deepEqual(Object.keys(landmarks).sort(), [
    "accessibleNames",
    "labeledValues",
    "tableRows",
    "text",
    "title",
    "url",
  ]);
  assert.equal("html" in landmarks, false);
  assert.equal("cookies" in landmarks, false);

  const teacher = extractMadrasatiTeacher(landmarks);
  assert.equal(teacher?.displayName, "معلم الاختبار");
  assert.equal(teacher?.schoolName, "مدرسة الاختبار الأهلية");
  assert.equal(teacher?.academicYear, "1447");
  assert.equal(teacher?.semester, "1");

  await automation.close();
});

test("PlaywrightBrowserAutomation — مقرراتي table landmarks normalize to classes", async () => {
  const { extractMadrasatiClasses } = await import("./madrasati-classes.ts");
  const { extractMadrasatiSubjects } = await import("./madrasati-subjects.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  try {
    const dir = mkdtempSync(join(tmpdir(), "madrasati-classes-"));
  const home = join(dir, "home.html");
  const courses = join(dir, "courses.html");

  writeFileSync(
    home,
    `<!doctype html><html lang="ar" dir="rtl"><body>
      <nav>
        <a href="courses.html">المقررات والمصادر</a>
        <a href="courses.html">مقرراتي</a>
        <a href="home.html">الرئيسية</a>
        <a href="#">جدولي</a>
        <a href="#">الواجبات</a>
      </nav>
      <p>مرحباً، معلم الاختبار</p>
    </body></html>`,
    "utf8",
  );
  writeFileSync(
    courses,
    `<!doctype html><html lang="ar" dir="rtl"><body>
      <nav>
        <a href="home.html">الرئيسية</a>
        <a href="courses.html">مقرراتي</a>
      </nav>
      <h1>مقرراتي</h1>
      <table>
        <thead>
          <tr><th>المقرر</th><th>الصف</th><th>الشعبة</th><th>المرحلة</th></tr>
        </thead>
        <tbody>
          <tr><td>الرياضيات</td><td>الصف الأول المتوسط</td><td>1</td><td>متوسط</td></tr>
          <tr><td>العلوم</td><td>الصف الأول المتوسط</td><td>2</td><td>متوسط</td></tr>
        </tbody>
      </table>
    </body></html>`,
    "utf8",
  );

  await automation.goto(page, `file://${home}`, { waitUntil: "domcontentloaded" });
  const opened = await automation.clickControlByAccessibleName(page, [
    "المقررات والمصادر",
    "مقرراتي",
  ]);
  assert.equal(opened, true);

  const appeared = await automation.waitForPageText(page, "الشعبة", 5000);
  assert.equal(appeared, true);

  const landmarks = await automation.readPageLandmarks(page);
  assert.equal("html" in landmarks, false);
  assert.ok((landmarks.tableRows ?? []).length >= 2);

  const extracted = extractMadrasatiClasses(landmarks);
  assert.equal(extracted.status, "found");
  assert.deepEqual(
    extracted.classes.map((item) => `${item.grade}/${item.className}`),
    ["الصف الأول المتوسط/1", "الصف الأول المتوسط/2"],
  );

  const subjects = extractMadrasatiSubjects(landmarks);
  assert.equal(subjects.status, "found");
  assert.deepEqual(
    subjects.subjects.map((item) => item.name),
    ["الرياضيات", "العلوم"],
  );

    const returned = await automation.clickControlByAccessibleName(page, ["الرئيسية"]);
    assert.equal(returned, true);
    assert.equal(await automation.waitForPageText(page, "جدولي", 5000), true);
  } finally {
    await automation.close();
  }
});

test("PlaywrightBrowserAutomation — جدولي table landmarks normalize to timetable entries", async () => {
  const { extractMadrasatiTimetable } = await import("./madrasati-timetable.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const automation = new PlaywrightBrowserAutomation();
  const session = await automation.openSession({
    viewport: { width: 390, height: 844 },
  });
  const page = await automation.openPage(session);

  try {
    const dir = mkdtempSync(join(tmpdir(), "madrasati-timetable-"));
    const home = join(dir, "home.html");
    const timetable = join(dir, "timetable.html");

    writeFileSync(
      home,
      `<!doctype html><html lang="ar" dir="rtl"><body>
        <nav>
          <a href="home.html">الرئيسية</a>
          <a href="timetable.html">جدولي</a>
          <a href="#">المقررات والمصادر</a>
          <a href="#">الواجبات</a>
        </nav>
        <p>مرحباً، معلم الاختبار</p>
      </body></html>`,
      "utf8",
    );
    writeFileSync(
      timetable,
      `<!doctype html><html lang="ar" dir="rtl"><body>
        <nav>
          <a href="home.html">الرئيسية</a>
          <a href="timetable.html">جدولي</a>
        </nav>
        <h1>جدولي</h1>
        <table>
          <thead>
            <tr>
              <th>اليوم</th>
              <th>الحصة</th>
              <th>المقرر</th>
              <th>الصف</th>
              <th>الشعبة</th>
              <th>قاعة</th>
              <th>من</th>
              <th>إلى</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>الأحد</td>
              <td>الحصة الأولى</td>
              <td>الرياضيات</td>
              <td>الصف الأول المتوسط</td>
              <td>1</td>
              <td>أ-101</td>
              <td>07:00</td>
              <td>07:45</td>
            </tr>
            <tr>
              <td>الاثنين</td>
              <td>2</td>
              <td>العلوم</td>
              <td>الصف الأول المتوسط</td>
              <td>2</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body></html>`,
      "utf8",
    );

    await automation.goto(page, `file://${home}`, { waitUntil: "domcontentloaded" });
    const opened = await automation.clickControlByAccessibleName(page, ["جدولي"]);
    assert.equal(opened, true);

    const appeared = await automation.waitForPageText(page, "الحصة", 5000);
    assert.equal(appeared, true);

    const landmarks = await automation.readPageLandmarks(page);
    assert.equal("html" in landmarks, false);
    assert.ok((landmarks.tableRows ?? []).length >= 2);

    const extracted = extractMadrasatiTimetable(landmarks);
    assert.equal(extracted.status, "found");
    assert.equal(extracted.entries[0]?.dayOfWeek, 0);
    assert.equal(extracted.entries[0]?.period, 1);
    assert.equal(extracted.entries[0]?.subject, "الرياضيات");
    assert.equal(extracted.entries[0]?.className, "1");
    assert.equal(extracted.entries[0]?.classroom, "أ-101");
    assert.equal(extracted.entries[0]?.startsAt, "07:00");
    assert.equal(extracted.entries[1]?.dayOfWeek, 1);
    assert.equal(extracted.entries[1]?.subject, "العلوم");
    assert.equal("classroom" in (extracted.entries[1] ?? {}), false);
    assert.equal("startsAt" in (extracted.entries[1] ?? {}), false);

    const returned = await automation.clickControlByAccessibleName(page, ["الرئيسية"]);
    assert.equal(returned, true);
    assert.equal(await automation.waitForPageText(page, "معلم الاختبار", 5000), true);
  } finally {
    await automation.close();
  }
});
