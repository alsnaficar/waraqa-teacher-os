import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MadrasatiLiveFrameHub,
  canEmbedThirdPartyLogin,
  encodeMadrasatiLiveSseEvent,
  mapRemoteDomInputType,
  parseMadrasatiLiveSseBlock,
  sanitizeFocusedControl,
  sanitizeLiveFrame,
} from "./madrasati-browser-live-session.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("Madrasati live-session transport policy", () => {
  it("never allows iframe embedding of third-party login", () => {
    assert.equal(canEmbedThirdPartyLogin(), false);
    assert.equal(canEmbedThirdPartyLogin({}), false);
    assert.equal(
      canEmbedThirdPartyLogin({
        xFrameOptions: "DENY",
      }),
      false,
    );
    assert.equal(
      canEmbedThirdPartyLogin({
        xFrameOptions: "SAMEORIGIN",
      }),
      false,
    );
    assert.equal(
      canEmbedThirdPartyLogin({
        contentSecurityPolicy: "frame-ancestors 'none'",
      }),
      false,
    );
  });

  it("maps remote DOM types without exposing a password field to Waraqa", () => {
    assert.equal(mapRemoteDomInputType("password"), "protected");
    assert.equal(mapRemoteDomInputType("email"), "email");
    assert.equal(mapRemoteDomInputType("text"), "text");
    assert.equal(mapRemoteDomInputType("checkbox"), "none");
  });

  it("strips values, cookies and HTML from focus metadata", () => {
    const sanitized = sanitizeFocusedControl({
      isEditable: true,
      inputType: "text",
      value: "secret-value",
      cookies: "sid=abc",
      password: "hunter2",
      html: "<input />",
      innerText: "secret-value",
    });

    assert.deepEqual(sanitized, {
      isEditable: true,
      inputType: "text",
    });
    assert.equal("value" in sanitized, false);
    assert.equal("cookies" in sanitized, false);
    assert.equal("password" in sanitized, false);
    assert.deepEqual(Object.keys(sanitized).sort(), ["inputType", "isEditable"]);
  });

  it("rejects unknown or empty live frames fail-closed", () => {
    assert.throws(() => sanitizeLiveFrame(null), /unavailable/i);
    assert.throws(
      () =>
        sanitizeLiveFrame({
          mimeType: "image/gif",
          base64: "AAAA",
          viewportWidth: 390,
          viewportHeight: 844,
        }),
      /unavailable/i,
    );
    assert.throws(
      () =>
        sanitizeLiveFrame({
          mimeType: "image/jpeg",
          base64: "AAAA",
          viewportWidth: 0,
          viewportHeight: 844,
        }),
      /viewport/i,
    );
  });

  it("keeps only pixel and viewport fields on a live frame", () => {
    const frame = sanitizeLiveFrame({
      mimeType: "image/jpeg",
      base64: "abc123",
      viewportWidth: 390,
      viewportHeight: 844,
      cookies: "must-not-survive",
      page: {},
    });

    assert.deepEqual(Object.keys(frame).sort(), [
      "base64",
      "mimeType",
      "viewportHeight",
      "viewportWidth",
    ]);
    assert.equal("cookies" in frame, false);
    assert.equal("page" in frame, false);
  });

  it("auth modal does not embed Microsoft/Madrasati in an iframe or collect a password", () => {
    const modal = readFileSync(
      join(
        ROOT,
        "src/platform/integration/connectors/madrasati/components/madrasati-auth-page.tsx",
      ),
      "utf8",
    );

    assert.equal(/<iframe/i.test(modal), false);
    assert.equal(/\btype=["']password["']/.test(modal), false);
    assert.equal(/كلمة المرور/.test(modal), false);
    assert.equal(/<Dialog[\s>]/.test(modal), false);
    assert.equal(/max-h-\[58vh\]/.test(modal), false);
    assert.equal(/grid-cols-2/.test(modal), false);
    assert.equal(/pb-52/.test(modal), false);
    assert.match(modal, /object-contain/);
    assert.match(modal, /flex-nowrap/);
    assert.match(
      modal,
      /const x = \(\(event\.clientX - rect\.left\) \/ rect\.width\) \* viewportWidth/,
    );
    assert.match(
      modal,
      /const y = \(\(event\.clientY - rect\.top\) \/ rect\.height\) \* viewportHeight/,
    );
    assert.match(modal, /consumeMadrasatiLiveFrames/);
    assert.match(modal, /waitForMadrasatiAuthenticationLiveFrame/);
    assert.match(modal, /inspectMadrasatiAuthenticationFocus/);
    assert.match(modal, /تم تسجيل الدخول إلى مدرستي بنجاح، جارٍ العودة إلى ورقة/);
    assert.match(modal, /navigate\(\{\s*to:\s*["']\/dashboard["']\s*\}\)/);
    assert.equal(/setInterval\(\s*\(\)\s*=>\s*\{\s*void pullLiveFrame/s.test(modal), false);
    assert.equal(/LIVE_FRAME_INTERVAL_MS/.test(modal), false);
    assert.equal(/socket\.io|new WebSocket/.test(modal), false);
    assert.match(
      modal,
      /Keep the authenticated Playwright session on the server for sync/,
    );
  });

  it("opens the native keyboard by focusing a real overlay input during the tap gesture", () => {
    const page = readFileSync(
      join(
        ROOT,
        "src/platform/integration/connectors/madrasati/components/madrasati-auth-page.tsx",
      ),
      "utf8",
    );

    assert.match(
      page,
      /function focusNativeInput\(\) \{\s*inputRef\.current\?\.focus\(\);\s*\}/s,
    );
    assert.equal(/requestAnimationFrame\s*\(\s*\(\)\s*=>\s*\{\s*inputRef/.test(page), false);
    assert.equal(/pointer-events-none/.test(page), false);
    assert.match(page, /onPointerDown=\{\(\) => \{\s*focusNativeInput\(\);/s);
    assert.match(page, /absolute inset-0 z-10 h-full min-h-\[44px\]/);
    assert.match(page, /relative z-10 inline-block max-h-full max-w-full/);
    assert.equal(/\btype=["']password["']/.test(page), false);
    assert.equal(/<iframe/i.test(page), false);
    assert.match(
      page,
      /const x = \(\(event\.clientX - rect\.left\) \/ rect\.width\) \* viewportWidth/,
    );
    assert.match(
      page,
      /const y = \(\(event\.clientY - rect\.top\) \/ rect\.height\) \* viewportHeight/,
    );
    assert.match(page, /image\.getBoundingClientRect\(\)/);
    assert.match(page, /focusNativeInput\(\);\s*setClickBusy\(true\);/s);
  });

  it("live frame hub publishes only the latest frame and cleans up subscribers", async () => {
    const hub = new MadrasatiLiveFrameHub();
    const seen: number[] = [];

    const unsubscribe = hub.subscribe("session-a", (update) => {
      seen.push(update.seq);
    });

    hub.publish("session-a", {
      mimeType: "image/jpeg",
      base64: "one",
      viewportWidth: 390,
      viewportHeight: 844,
    });
    hub.publish("session-a", {
      mimeType: "image/jpeg",
      base64: "two",
      viewportWidth: 390,
      viewportHeight: 844,
    });

    assert.deepEqual(seen, [1, 2]);
    assert.equal(hub.getLatest("session-a")?.frame.base64, "two");

    unsubscribe();
    hub.close("session-a");
    assert.equal(hub.subscriberCount("session-a"), 0);
    assert.equal(hub.getLatest("session-a"), null);
  });

  it("waitForFrame resolves from a later publish and does not leak subscribers", async () => {
    const hub = new MadrasatiLiveFrameHub();
    const pending = hub.waitForFrame("session-b", 0, 200);

    queueMicrotask(() => {
      hub.publish("session-b", {
        mimeType: "image/jpeg",
        base64: "next",
        viewportWidth: 390,
        viewportHeight: 844,
      });
    });

    const update = await pending;
    assert.equal(update?.frame.base64, "next");
    assert.equal(hub.subscriberCount("session-b"), 0);
    hub.close("session-b");
  });

  it("encodes and parses SSE frame events without extra fields", () => {
    const encoded = encodeMadrasatiLiveSseEvent("frame", {
      seq: 3,
      mimeType: "image/jpeg",
      base64: "abc",
      viewportWidth: 390,
      viewportHeight: 844,
    });

    const parsed = parseMadrasatiLiveSseBlock(encoded.trim());
    assert.equal(parsed?.event, "frame");
    assert.deepEqual(parsed?.data, {
      seq: 3,
      mimeType: "image/jpeg",
      base64: "abc",
      viewportWidth: 390,
      viewportHeight: 844,
    });
  });

  it("does not add a socket library for live transport", () => {
    const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
    assert.equal(/socket\.io|ws"|websocket/i.test(pkg), false);

    const client = readFileSync(
      join(
        ROOT,
        "src/platform/integration/connectors/madrasati/madrasati-live-frame-client.ts",
      ),
      "utf8",
    );
    assert.match(client, /text\/event-stream/);
    assert.equal(/socket\.io|new WebSocket/.test(client), false);
  });

  it("server functions keep live-frame and focus calls behind requireSupabaseAuth", () => {
    const source = readFileSync(
      join(
        ROOT,
        "src/platform/integration/connectors/madrasati/madrasati.functions.ts",
      ),
      "utf8",
    );

    assert.match(
      source,
      /export const getMadrasatiAuthenticationLiveFrame[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const inspectMadrasatiAuthenticationFocus[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const waitForMadrasatiAuthenticationLiveFrame[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const inspectMadrasatiAuthentication[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*authenticationState: page\.authenticationState/,
    );
    assert.match(
      source,
      /export const getMadrasatiAuthenticationStatus[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const getMadrasatiTeacherProfile[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const getMadrasatiClasses[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const getMadrasatiSubjects[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const getMadrasatiTimetable[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.match(
      source,
      /export const verifyMadrasatiLiveExtraction[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.equal(/data\.userId|data\.teacherId|data\.email/.test(source), false);
  });
});
