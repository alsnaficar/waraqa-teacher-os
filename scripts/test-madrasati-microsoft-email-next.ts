/**
 * Real VPS check for the Microsoft email → Next milestone.
 *
 * Run:
 *   npx tsx scripts/test-madrasati-microsoft-email-next.ts
 *
 * Optional:
 *   TEST_MADRASATI_EMAIL=test@example.com npx tsx scripts/test-madrasati-microsoft-email-next.ts
 *
 * This script never types a password or MFA code, never stores credentials,
 * and never logs passwords, tokens, cookies, OAuth state, or the test email.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MadrasatiBrowserAdapter } from "../src/features/madrasati/browser/madrasati-browser-adapter.server.ts";
import { PlaywrightBrowserAutomation } from "../src/features/madrasati/browser/playwright-browser-automation.server.ts";

const MICROSOFT_WAIT_MS = 45000;
const EMAIL_FIELD_WAIT_MS = 20000;
const AFTER_NEXT_WAIT_MS = 10000;

async function main(): Promise<void> {
  const testEmail = readOptionalTestEmail();
  const automation = new PlaywrightBrowserAutomation();
  const adapter = new MadrasatiBrowserAdapter(automation);

  try {
    const connected = await adapter.connect();
    console.log("connect", {
      state: connected.state,
      authenticationState: connected.authenticationState,
      browserAutomationAvailable: connected.browserAutomationAvailable,
    });

    if (connected.state !== "connected") {
      throw new Error(`Madrasati connect failed: ${connected.state}`);
    }

    const started = await adapter.beginAuthentication();
    console.log("beginAuthentication", {
      state: started.state,
      authenticationState: started.authenticationState,
    });

    const openedMicrosoft = await adapter.openMicrosoftAuthentication();
    console.log("openMicrosoftAuthentication", { clickedOrAlreadyThere: openedMicrosoft });

    await waitUntil("Microsoft login hostname", MICROSOFT_WAIT_MS, async () => {
      const inspection = await adapter.inspectAuthenticationPage();
      return isMicrosoftLoginHostname(inspection.url);
    });

    const microsoftHost = publicLocation(
      (await adapter.inspectAuthenticationPage()).url,
    ).hostname;

    if (microsoftHost !== "login.microsoftonline.com") {
      throw new Error(
        `Expected login.microsoftonline.com, received ${microsoftHost || "(empty)"}`,
      );
    }

    const emailFocus = await waitForEditableEmailField(adapter);
    const microsoftPage = await adapter.inspectAuthenticationPage();
    const microsoftLocation = publicLocation(microsoftPage.url);

    console.log("microsoftLogin", {
      hostname: microsoftLocation.hostname,
      pathname: microsoftLocation.pathname,
      title: microsoftPage.title,
      authenticationState: microsoftPage.authenticationState,
      text: describePageText(microsoftPage.text),
    });
    console.log("emailField", {
      isEditable: emailFocus.isEditable,
      inputType: emailFocus.inputType,
      testEmailProvided: Boolean(testEmail),
    });

    if (!testEmail) {
      console.log(
        "Stopped before Next. Set TEST_MADRASATI_EMAIL to a dedicated test mailbox to run the real Next step. Do not use a production password or MFA code.",
      );
      return;
    }

    await adapter.focusAuthenticationEditableControl();
    await adapter.typeAuthentication(testEmail);

    const afterType = await adapter.inspectAuthenticationFocus();
    console.log("typedEmail", {
      isEditable: afterType.isEditable,
      inputType: afterType.inputType,
      emailRedacted: true,
    });

    await adapter.submitAuthenticationEmail();

    const settled = await waitForPostEmailMicrosoftPage(adapter);
    const settledLocation = publicLocation(settled.url);
    const screenshot = await adapter.getAuthenticationScreenshot();
    const screenshotPath = join(tmpdir(), "madrasati-microsoft-email-next.png");
    writeFileSync(screenshotPath, screenshot);
    const pageText = describePageText(redactEmail(settled.text, testEmail));

    console.log("afterNext", {
      hostname: settledLocation.hostname,
      pathname: settledLocation.pathname,
      title: settled.title,
      authenticationState: settled.authenticationState,
      text: pageText,
      stillOnMicrosoft: isMicrosoftLoginHostname(settled.url),
      screenshotBytes: screenshot.length,
      screenshotPath,
      passwordEntered: false,
      mfaEntered: false,
    });

    if (isBrowserErrorHostname(settledLocation.hostname)) {
      throw new Error(
        "After Next, Chromium opened an error page instead of the next Microsoft login step. The email was submitted; password and MFA were not entered.",
      );
    }

    if (!isMicrosoftLoginHostname(settled.url)) {
      throw new Error(
        `After Next, expected a Microsoft login host, received ${settledLocation.hostname || "(empty)"}`,
      );
    }
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await automation.close().catch(() => undefined);
  }
}

function readOptionalTestEmail(): string | null {
  const raw = process.env.TEST_MADRASATI_EMAIL?.trim() ?? "";

  if (!raw) {
    return null;
  }

  if (!raw.includes("@") || raw.length > 254) {
    throw new Error("TEST_MADRASATI_EMAIL is not a usable test email.");
  }

  return raw;
}

async function waitForEditableEmailField(
  adapter: MadrasatiBrowserAdapter,
) {
  const started = Date.now();
  let lastFocus = await adapter.inspectAuthenticationFocus();

  while (Date.now() - started < EMAIL_FIELD_WAIT_MS) {
    if (isUsableEmailFocus(lastFocus)) {
      return lastFocus;
    }

    await adapter.focusAuthenticationEditableControl().catch(() => lastFocus);
    lastFocus = await adapter.inspectAuthenticationFocus();

    if (isUsableEmailFocus(lastFocus)) {
      return lastFocus;
    }

    await delay(400);
  }

  throw new Error("Timed out waiting for an editable Microsoft email field.");
}

function isUsableEmailFocus(focus: {
  isEditable: boolean;
  inputType: string;
}): boolean {
  return (
    focus.isEditable &&
    (focus.inputType === "email" || focus.inputType === "text")
  );
}

async function waitUntil(
  label: string,
  timeoutMs: number,
  check: () => Promise<boolean>,
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForPostEmailMicrosoftPage(
  adapter: MadrasatiBrowserAdapter,
) {
  const started = Date.now();
  let latest = await adapter.inspectAuthenticationPage();

  while (Date.now() - started < AFTER_NEXT_WAIT_MS) {
    latest = await adapter.inspectAuthenticationPage();
    const location = publicLocation(latest.url);
    const text = describePageText(latest.text);

    if (isBrowserErrorHostname(location.hostname)) {
      return latest;
    }

    if (text.hasPasswordPrompt || text.hasAccountError) {
      return latest;
    }

    await delay(400);
  }

  return latest;
}

function isBrowserErrorHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  return normalized === "chromewebdata" || normalized === "chrome-error";
}

function isMicrosoftLoginHostname(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return (
      hostname === "login.microsoftonline.com" ||
      hostname.endsWith(".microsoftonline.com") ||
      hostname === "login.live.com" ||
      hostname === "login.microsoft.com"
    );
  } catch {
    return false;
  }
}

function publicLocation(url: string): { hostname: string; pathname: string } {
  try {
    const parsed = new URL(url);

    return {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch {
    return { hostname: "", pathname: "" };
  }
}

function describePageText(text: string): {
  length: number;
  hasSignIn: boolean;
  hasPasswordPrompt: boolean;
  hasAccountError: boolean;
  hasNext: boolean;
  hasEmailHint: boolean;
} {
  return {
    length: text.length,
    hasSignIn: /sign in|تسجيل الدخول/i.test(text),
    hasPasswordPrompt: /password|كلمة المرور|enter password/i.test(text),
    hasAccountError:
      /couldn['’]t find|doesn't exist|username may be incorrect|this username|هذا الحساب|غير صحيح/i.test(
        text,
      ),
    hasNext: /\bnext\b|التالي/i.test(text),
    hasEmailHint: /email|بريد|skype/i.test(text),
  };
}

function redactEmail(text: string, email: string): string {
  return text.split(email).join("[redacted-email]");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown integration error.";
  console.error("madrasati-microsoft-email-next failed:", message);
  process.exitCode = 1;
});
