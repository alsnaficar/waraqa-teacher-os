import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MADRASATI_DRY_RUN_DISCLAIMER,
  runAuthenticatedMadrasatiDryRunPreview,
} from "../../../platform/integration/connectors/madrasati/madrasati-preview.server.ts";
import { MOCK_MADRASATI_TIMETABLE } from "../mock/fixtures.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FUNCTIONS_FILE = "src/platform/integration/connectors/madrasati/madrasati.functions.ts";
const PREVIEW_CORE_FILE =
  "src/platform/integration/connectors/madrasati/madrasati-preview.server.ts";
const MODAL_FILE =
  "src/routes/_authenticated/settings.tsx";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Madrasati authenticated dry-run preview", () => {
  it("rejects missing authenticated user id", async () => {
    await assert.rejects(
      () => runAuthenticatedMadrasatiDryRunPreview(""),
      /Unauthorized|authenticated user/i,
    );
  });

  it("uses the verified waraqaUserId as preview owner", async () => {
    const result = await runAuthenticatedMadrasatiDryRunPreview(USER_A);
    assert.equal(result.waraqaUserId, USER_A);
    assert.equal(result.dryRun, true);
    assert.equal(result.isMockPreview, true);
    assert.equal(result.disclaimer, MADRASATI_DRY_RUN_DISCLAIMER);
  });

  it("client-supplied alternate user id cannot become owner unless passed as auth context", async () => {
    // Simulates: server always passes context.userId (USER_A), ignoring any client payload.
    const forgedClientPayload = { userId: USER_B, teacherId: USER_B };
    const result = await runAuthenticatedMadrasatiDryRunPreview(USER_A);
    assert.equal(result.waraqaUserId, USER_A);
    assert.notEqual(result.waraqaUserId, forgedClientPayload.userId);
    assert.notEqual(result.waraqaUserId, forgedClientPayload.teacherId);
  });

  it("returns mock provider timetable data", async () => {
    const result = await runAuthenticatedMadrasatiDryRunPreview(USER_A);
    assert.equal(result.connection.isMock, true);
    assert.ok(result.teacher);
    assert.ok(result.subjects.length > 0);
    assert.ok(result.classes.length > 0);
    assert.equal(result.timetable.accepted.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(result.counts.discovered, MOCK_MADRASATI_TIMETABLE.length);
    assert.match(result.disclaimer, /معاينة تجريبية/);
  });

  it("server function wires requireSupabaseAuth and context.userId only", () => {
    const source = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    assert.match(source, /export const previewMadrasatiSync/);
    assert.match(
      source,
      /previewMadrasatiSync[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.equal(/\.inputValidator\(/.test(source.split("previewMadrasatiSync")[1] ?? ""), false);
    assert.equal(/data\.userId|data\.teacherId|data\.profileId|data\.email/.test(source), false);
    assert.match(source, /runAuthenticatedMadrasatiDryRunPreview\(context\.userId\)/);
  });

  it("server-side Madrasati keyboard input has a strict allowlist", () => {
    const authServerFile =
      "src/platform/integration/connectors/madrasati/madrasati-auth.server.ts";
    const source = readFileSync(join(ROOT, authServerFile), "utf8");

    assert.match(source, /const allowedKeys = new Set\(\[/);
    assert.match(source, /"Enter"/);
    assert.match(source, /"Tab"/);
    assert.match(source, /"Backspace"/);
    assert.match(source, /"Delete"/);
    assert.match(source, /"Escape"/);
    assert.match(source, /"ArrowLeft"/);
    assert.match(source, /"ArrowRight"/);
    assert.match(source, /"ArrowUp"/);
    assert.match(source, /"ArrowDown"/);
    assert.match(
      source,
      /if \(!normalizedKey \|\| !allowedKeys\.has\(normalizedKey\)\)/,
    );
    assert.match(source, /Unsupported Madrasati browser key/);
  });

  it("preview core uses mock mode and never browser adapter / DB writes / network", () => {
    const core = readFileSync(join(ROOT, PREVIEW_CORE_FILE), "utf8");
    assert.match(core, /mode:\s*"mock"/);
    assert.equal(/mode:\s*"browser"/.test(core), false);
    assert.equal(/MadrasatiBrowserAdapter/.test(core), false);
    assert.equal(/TeacherTimetableService\.saveTimetable/.test(core), false);
    assert.equal(/\.from\(["']profiles["']\)/.test(core), false);
    assert.equal(/\.from\(["']curriculum_/.test(core), false);
    assert.equal(/lesson_sessions/.test(core), false);
    assert.equal(/\bfetch\s*\(/.test(core), false);
    assert.equal(/schools\.madrasati\.sa/.test(core), false);
    assert.equal(/\bpassword\s*[:=]|كلمة المرور/i.test(core), false);
  });

  it("UI exposes dry-run preview action with honest disclaimer", () => {
    const modal = readFileSync(join(ROOT, MODAL_FILE), "utf8");
    assert.match(modal, /معاينة مزامنة مدرستي/);
    assert.match(modal, /MADRASATI_DRY_RUN_DISCLAIMER|معاينة تجريبية/);
    assert.match(modal, /getMadrasatiAuthenticationStatus/);
    assert.match(modal, /getMadrasatiTeacherProfile/);
    assert.match(modal, /getMadrasatiClasses/);
    assert.match(modal, /getMadrasatiSubjects/);
    assert.match(modal, /getMadrasatiTimetable/);
    assert.match(modal, /verifyMadrasatiLiveExtraction/);
    assert.equal(/\btype=["']password["']/.test(modal), false);
    assert.equal(/تم جلب البيانات من مدرستي|تمت المزامنة/.test(modal), false);
  });
});
