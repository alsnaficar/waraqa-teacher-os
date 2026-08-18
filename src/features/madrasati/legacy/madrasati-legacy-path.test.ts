import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MadrasatiOAuthService,
  MADRASATI_CONNECTION_UNAVAILABLE_MESSAGE,
} from "../auth/oauth.service.ts";
import { createMadrasatiProvider } from "../provider/create-madrasati-provider.server.ts";
import { MadrasatiSyncService } from "../sync/madrasati-sync.service.ts";
import {
  MADRASATI_BROWSER_SYNC_NOT_READY_CODE,
  MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
} from "../../../platform/integration/connectors/madrasati/madrasati-status.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const LEGACY_UI_FILES = [
  "src/platform/integration/connectors/madrasati/components/madrasati-auth-page.tsx",
  "src/routes/_authenticated/madrasati-login.tsx",
  "src/routes/connect-school.tsx",
  "src/routes/_authenticated/settings.tsx",
  "src/components/dashboard/dashboard-header.tsx",
] as const;

const LEGACY_SYNC_FILE = "src/platform/integration/connectors/madrasati/madrasati.functions.ts";

const OAUTH_FILE = "src/features/madrasati/auth/oauth.service.ts";
const SERVICE_FILE = "src/features/madrasati/services/madrasati.service.ts";

describe("Madrasati legacy password / fake auth removal", () => {
  it("active Madrasati UI does not collect or submit a password", () => {
    for (const relative of LEGACY_UI_FILES) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      assert.equal(
        /\btype=["']password["']|\bpassword\s*[:=]|كلمة المرور/i.test(source),
        false,
        `${relative} must not collect Madrasati passwords`,
      );
      assert.equal(
        /syncMadrasatiSchedule\s*\(/.test(source),
        false,
        `${relative} must not call legacy syncMadrasatiSchedule`,
      );
    }
  });

  it("legacy sync function cannot fabricate timetable data or accept credentials", () => {
    const source = readFileSync(join(ROOT, LEGACY_SYNC_FILE), "utf8");
    assert.match(source, /MADRASATI_BROWSER_SYNC_NOT_READY/);
    assert.match(source, /available:\s*false/);
    assert.match(source, /timetable:\s*\[\]/);
    assert.equal(/\bpassword\b/i.test(source), false);
    assert.equal(/z\.string\(\)\.email/.test(source), false);
    assert.equal(/لغتي الخالدة/.test(source), false);
    assert.equal(/from\(["']curriculum_files["']\)/.test(source), false);
    assert.equal(/TeacherTimetableService\.saveTimetable/.test(source), false);
    assert.equal(/profiles["']\)\s*\.update/.test(source), false);
    assert.equal(/\bfetch\s*\(/.test(source), false);
    assert.equal(/schools\.madrasati\.sa/.test(source), false);
  });

  it("fake OAuth cannot report a false Madrasati connection", async () => {
    assert.equal(await MadrasatiOAuthService.isConnected(), false);
    assert.equal(await MadrasatiOAuthService.isAuthenticated(), false);
    assert.equal(
      MadrasatiOAuthService.getStatusMessage(),
      MADRASATI_CONNECTION_UNAVAILABLE_MESSAGE,
    );
    await assert.rejects(
      () => MadrasatiOAuthService.connect(),
      (error: unknown) =>
        error instanceof Error && error.message === MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE,
    );

    const oauthSource = readFileSync(join(ROOT, OAUTH_FILE), "utf8");
    assert.equal(/supabase\.auth\.getSession\s*\(/.test(oauthSource), false);
    assert.equal(/supabase\.auth\.signOut\s*\(/.test(oauthSource), false);

    const serviceSource = readFileSync(join(ROOT, SERVICE_FILE), "utf8");
    assert.match(serviceSource, /MadrasatiOAuthService\.isConnected\s*\(/);
    assert.equal(/MadrasatiOAuthService\.isAuthenticated\s*\(/.test(serviceSource), false);
  });

  it("status messaging stays honest about browser sync availability", () => {
    assert.equal(MADRASATI_BROWSER_SYNC_NOT_READY_CODE, "MADRASATI_BROWSER_SYNC_NOT_READY");
    assert.match(MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE, /المتصفح/);

    const settings = readFileSync(join(ROOT, "src/routes/_authenticated/settings.tsx"), "utf8");
    assert.match(settings, /مزامنة مدرستي ستتم عبر المتصفح عند توفر المنصة/);
    assert.equal(/ربط ومزامنة جدول مدرستي/.test(settings), false);
  });

  it("dry-run foundation remains intact without DB writes or live Madrasati calls", async () => {
    const provider = createMadrasatiProvider({ mode: "mock" });
    const sync = new MadrasatiSyncService(provider);
    const result = await sync.previewSync("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    assert.equal(result.dryRun, true);
    assert.equal(result.connection.isMock, true);
    assert.ok(result.timetable.accepted.length > 0);
    assert.equal(result.waraqaUserId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
});
