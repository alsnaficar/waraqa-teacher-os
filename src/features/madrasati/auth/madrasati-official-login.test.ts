import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  closeMadrasatiLoginWindow,
  getMadrasatiOfficialLoginStatus,
  MADRASATI_LOGIN_URL,
  MADRASATI_LOGIN_WINDOW_FEATURES,
  MADRASATI_LOGIN_WINDOW_NAME,
  MADRASATI_OFFICIAL_LOGIN_COPY,
  openMadrasatiLoginWindow,
  type MadrasatiLoginWindowHandle,
} from "../../../platform/integration/connectors/madrasati/madrasati-official-login.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function fakeWindow(closed = false): MadrasatiLoginWindowHandle & {
  focusCalls: number;
  closeCalls: number;
} {
  const handle = {
    closed,
    focusCalls: 0,
    closeCalls: 0,
    opener: {} as unknown,
    focus() {
      handle.focusCalls += 1;
    },
    close() {
      handle.closeCalls += 1;
      handle.closed = true;
    },
  };

  return handle;
}

describe("official Madrasati login in the user browser", () => {
  it("opens only the real Madrasati SignIn URL as a named popup", () => {
    const calls: Array<{ url: string; name: string; features: string }> = [];
    const popup = fakeWindow();

    const result = openMadrasatiLoginWindow(null, (url, name, features) => {
      calls.push({ url, name, features });
      return popup;
    });

    assert.equal(result.status, "opened");
    assert.equal(result.popup, popup);
    assert.equal(popup.opener, null);
    assert.deepEqual(calls, [
      {
        url: MADRASATI_LOGIN_URL,
        name: MADRASATI_LOGIN_WINDOW_NAME,
        features: MADRASATI_LOGIN_WINDOW_FEATURES,
      },
    ]);
    assert.equal(MADRASATI_LOGIN_URL, "https://schools.madrasati.sa/Auth/SignIn");
    assert.equal(MADRASATI_LOGIN_WINDOW_NAME, "waraqa-madrasati-login");
    assert.match(MADRASATI_LOGIN_WINDOW_FEATURES, /popup/);
    assert.match(MADRASATI_LOGIN_WINDOW_FEATURES, /width=480/);
    assert.match(MADRASATI_LOGIN_WINDOW_FEATURES, /height=850/);
  });

  it("reuses an already-open window instead of opening another", () => {
    const current = fakeWindow();
    let opened = 0;

    const result = openMadrasatiLoginWindow(current, () => {
      opened += 1;
      return fakeWindow();
    });

    assert.equal(result.status, "focused");
    assert.equal(result.popup, current);
    assert.equal(current.focusCalls, 1);
    assert.equal(opened, 0);
  });

  it("reports a blocked popup without inventing a window", () => {
    assert.deepEqual(
      openMadrasatiLoginWindow(null, () => null),
      { status: "blocked", popup: null },
    );
    assert.deepEqual(
      openMadrasatiLoginWindow(null, () => fakeWindow(true)),
      { status: "blocked", popup: null },
    );
  });

  it("closes the opened window when the browser allows it", () => {
    const popup = fakeWindow();
    assert.equal(closeMadrasatiLoginWindow(popup), "closed");
    assert.equal(popup.closeCalls, 1);
    assert.equal(closeMadrasatiLoginWindow(popup), "already-closed");
    assert.equal(closeMadrasatiLoginWindow(null), "already-closed");
  });

  it("treats window.close() exceptions as a blocked close", () => {
    const popup: MadrasatiLoginWindowHandle = {
      closed: false,
      close() {
        throw new Error("cross-origin");
      },
    };

    assert.equal(closeMadrasatiLoginWindow(popup), "blocked");
  });

  it("uses honest local status copy and never claims a verified Madrasati link", () => {
    assert.equal(getMadrasatiOfficialLoginStatus("ready"), "جاهز لفتح مدرستي");
    assert.equal(
      getMadrasatiOfficialLoginStatus("opened"),
      "تم فتح مدرستي. أكمل تسجيل الدخول ثم عد إلى هذه الصفحة.",
    );
    assert.equal(getMadrasatiOfficialLoginStatus("returned"), "تمت العودة إلى ورقة");
    assert.match(getMadrasatiOfficialLoginStatus("blocked"), /النوافذ المنبثقة/);

    const claimed = [
      MADRASATI_OFFICIAL_LOGIN_COPY.statusReady,
      MADRASATI_OFFICIAL_LOGIN_COPY.statusOpened,
      MADRASATI_OFFICIAL_LOGIN_COPY.statusReturned,
      MADRASATI_OFFICIAL_LOGIN_COPY.verificationNote,
    ].join("\n");

    assert.equal(/تم ربط مدرستي/.test(claimed), false);
    assert.equal(/تمت المصادقة مع مدرستي/.test(claimed), false);
    assert.equal(/تمت المزامنة/.test(claimed), false);
    assert.match(MADRASATI_OFFICIAL_LOGIN_COPY.verificationNote, /لا تتحقق/);
    assert.match(MADRASATI_OFFICIAL_LOGIN_COPY.securityNotice, /ولا تمر عبر ورقة/);
  });

  it("login route no longer mounts the remote-browser page", () => {
    const route = readFileSync(join(ROOT, "src/routes/_authenticated/madrasati-login.tsx"), "utf8");
    const page = readFileSync(
      join(
        ROOT,
        "src/platform/integration/connectors/madrasati/components/madrasati-official-login.tsx",
      ),
      "utf8",
    );
    const helper = readFileSync(
      join(ROOT, "src/platform/integration/connectors/madrasati/madrasati-official-login.ts"),
      "utf8",
    );
    const combined = `${route}\n${page}\n${helper}`;

    assert.match(route, /MadrasatiOfficialLoginPage/);
    assert.equal(/MadrasatiAuthPage/.test(combined), false);
    assert.equal(/iframe/i.test(combined), false);
    assert.equal(/screencast|live-session|screenshot|Playwright|CDP/i.test(combined), false);
    assert.equal(/popup\.location|popup\.document|contentWindow/.test(combined), false);
    assert.match(combined, /madrasati-official-login/);
  });
});
