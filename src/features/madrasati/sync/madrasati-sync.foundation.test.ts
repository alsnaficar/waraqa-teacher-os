import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MadrasatiBrowserAdapter } from "../browser/madrasati-browser-adapter.server.ts";
import { UnavailableBrowserAutomation } from "../browser/browser-automation.ts";
import {
  MOCK_MADRASATI_TIMETABLE,
  MOCK_MADRASATI_TIMETABLE_WITH_ISSUES,
} from "../mock/fixtures.ts";
import { MockMadrasatiProvider } from "../mock/mock-madrasati-provider.ts";
import { createMadrasatiProvider } from "../provider/create-madrasati-provider.server.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";
import { MadrasatiNotConnectedError } from "../provider/madrasati-provider.ts";
import { MadrasatiSyncService } from "../sync/madrasati-sync.service.ts";
import { normalizeTimetableEntries } from "../sync/normalize-timetable.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const WARAQA_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function consumeAsProvider(provider: MadrasatiProvider) {
  await provider.connect();
  const timetable = await provider.getTimetable();
  await provider.disconnect();
  return timetable;
}

describe("Madrasati foundation — mock provider", () => {
  it("connects and reports mock connection status", async () => {
    const provider = new MockMadrasatiProvider();
    const before = await provider.getConnectionStatus();
    assert.equal(before.state, "disconnected");
    assert.equal(before.isMock, true);

    const connected = await provider.connect();
    assert.equal(connected.state, "connected");
    assert.equal(connected.isMock, true);
    assert.equal(connected.browserAutomationAvailable, false);
    assert.match(connected.message, /وهمي|mock|تجريبي/i);
  });

  it("disconnects after connect", async () => {
    const provider = new MockMadrasatiProvider();
    await provider.connect();
    const disconnected = await provider.disconnect();
    assert.equal(disconnected.state, "disconnected");

    await assert.rejects(() => provider.getTimetable(), MadrasatiNotConnectedError);
  });

  it("returns normalized fixture timetable when connected", async () => {
    const provider = new MockMadrasatiProvider();
    await provider.connect();
    const timetable = await provider.getTimetable();
    assert.equal(timetable.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(timetable[0]?.subject, "لغتي الخالدة");
    assert.equal(timetable[0]?.dayOfWeek, 0);
    assert.equal(timetable[0]?.period, 1);
  });

  it("is consumed through MadrasatiProvider without knowing the concrete class", async () => {
    const provider: MadrasatiProvider = createMadrasatiProvider({ mode: "mock" });
    const timetable = await consumeAsProvider(provider);
    assert.ok(timetable.length > 0);
  });
});

describe("Madrasati foundation — normalize timetable", () => {
  it("accepts valid rows and rejects invalid ones safely", () => {
    const result = normalizeTimetableEntries([...MOCK_MADRASATI_TIMETABLE_WITH_ISSUES]);
    assert.equal(result.discovered, MOCK_MADRASATI_TIMETABLE_WITH_ISSUES.length);
    assert.equal(result.accepted.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.ok(result.rejected.some((r) => r.reason === "missing_subject"));
    assert.ok(result.rejected.some((r) => r.reason === "invalid_day_of_week"));
    assert.ok(result.rejected.some((r) => r.reason === "invalid_period"));
  });

  it("handles duplicate timetable entries deterministically (first wins)", () => {
    const result = normalizeTimetableEntries([...MOCK_MADRASATI_TIMETABLE_WITH_ISSUES]);
    const slotZero = result.accepted.filter((r) => r.dayOfWeek === 0 && r.period === 1);
    assert.equal(slotZero.length, 1);
    assert.equal(slotZero[0]?.subject, "لغتي الخالدة");
    assert.ok(result.duplicates.some((r) => r.reason === "duplicate_exact"));
    assert.ok(result.duplicates.some((r) => r.reason === "duplicate_slot"));
  });
});

describe("Madrasati foundation — sync service", () => {
  it("normalizes mock timetable in a dry-run preview tied to Waraqa user id", async () => {
    const provider = new MockMadrasatiProvider();
    const sync = new MadrasatiSyncService(provider);
    const result = await sync.previewSync(WARAQA_USER);

    assert.equal(result.dryRun, true);
    assert.equal(result.waraqaUserId, WARAQA_USER);
    assert.equal(result.connection.isMock, true);
    assert.ok(result.teacher);
    assert.ok(result.classes.length > 0);
    assert.ok(result.subjects.length > 0);
    assert.equal(result.timetable.accepted.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(result.counts.discovered, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(result.counts.added, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(result.counts.changed, 0);
    assert.equal(result.counts.unchanged, 0);
    assert.ok(result.warnings.some((w) => /mock/i.test(w)));
    assert.equal(result.errors.length, 0);
  });

  it("classifies unchanged vs changed against an existing baseline without writing", async () => {
    const provider = new MockMadrasatiProvider();
    const sync = new MadrasatiSyncService(provider);
    const baseline = MOCK_MADRASATI_TIMETABLE.map((row) => ({ ...row }));
    baseline[0] = { ...baseline[0]!, subject: "مادة قديمة" };

    const result = await sync.previewSync(WARAQA_USER, { existingTimetable: baseline });
    assert.equal(result.dryRun, true);
    assert.equal(result.counts.unchanged, MOCK_MADRASATI_TIMETABLE.length - 1);
    assert.equal(result.counts.changed, 1);
    assert.equal(result.counts.added, 0);
  });

  it("rejects empty waraqaUserId (owner must come from auth context)", async () => {
    const sync = new MadrasatiSyncService(new MockMadrasatiProvider());
    await assert.rejects(() => sync.previewSync(""), /waraqaUserId/);
  });
});

describe("Madrasati foundation — browser adapter boundary", () => {
  it("uses the real Playwright backend when browser mode is selected", async () => {
    const provider = createMadrasatiProvider({ mode: "browser" });
    assert.ok(provider instanceof MadrasatiBrowserAdapter);
    const status = await provider.getConnectionStatus();
    assert.equal(status.state, "not_implemented");
    assert.equal(status.browserAutomationAvailable, true);
    assert.equal(status.isMock, false);
  });

  it("UnavailableBrowserAutomation fails closed without network I/O", async () => {
    const automation = new UnavailableBrowserAutomation();
    const page = Object.freeze({ id: "none" });
    await assert.rejects(() => automation.assertAvailable(), /Playwright|Puppeteer|not available/i);
    await assert.rejects(() => automation.startPageLiveView(page), /not available/i);
    await assert.rejects(() => automation.getPageLiveFrame(page), /not available/i);
    await assert.rejects(() => automation.inspectFocusedControl(page), /not available/i);
  });
});

describe("Madrasati foundation — security invariants in source", () => {
  it("does not persist Madrasati credentials in foundation modules", () => {
    const files = [
      "src/features/madrasati/provider/madrasati-provider.ts",
      "src/features/madrasati/provider/models.ts",
      "src/features/madrasati/mock/mock-madrasati-provider.ts",
      "src/features/madrasati/sync/madrasati-sync.service.ts",
      "src/features/madrasati/browser/madrasati-browser-adapter.server.ts",
      "src/features/madrasati/browser/browser-automation.ts",
    ];

    for (const relative of files) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      assert.equal(
        /\bpassword\s*[:=]|كلمة المرور/i.test(source),
        false,
        `${relative} must not declare password fields`,
      );
      assert.equal(/cookie/i.test(source) && /console\.(log|info|debug)/i.test(source), false);
    }
  });

  it("foundation modules do not call schools.madrasati.sa or microsoft login", () => {
    const files = [
      "src/features/madrasati/mock/mock-madrasati-provider.ts",
      "src/features/madrasati/sync/madrasati-sync.service.ts",
      "src/features/madrasati/browser/browser-automation.ts",
    ];

    for (const relative of files) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      assert.equal(
        /schools\.madrasati\.sa|login\.microsoftonline|graph\.microsoft/i.test(source),
        false,
        `${relative} must not contain live Madrasati or Microsoft endpoints`,
      );
      assert.equal(
        /\bfetch\s*\(/.test(source),
        false,
        `${relative} must not perform direct network requests`,
      );
    }
  });
});
