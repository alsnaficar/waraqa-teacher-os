import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { MockMadrasatiProvider } from "../mock/mock-madrasati-provider.ts";
import {
  MOCK_MADRASATI_TIMETABLE,
  MOCK_MADRASATI_TIMETABLE_WITH_ISSUES,
} from "../mock/fixtures.ts";
import { MadrasatiBrowserAdapter } from "../browser/madrasati-browser-adapter.server.ts";
import { UnavailableBrowserAutomation } from "../browser/browser-automation.ts";
import { mapMadrasatiTimetableToTeacherDrafts } from "../sync/map-to-teacher-timetable.ts";
import type { TeacherTimetableDraft } from "../sync/map-to-teacher-timetable.ts";
import {
  MADRASATI_APPLY_EMPTY_CODE,
  MADRASATI_APPLY_INCOMPLETE_CODE,
  MADRASATI_APPLY_NOT_MOCK_CODE,
  MADRASATI_MOCK_APPLY_DISCLAIMER,
  MadrasatiSyncService,
} from "../sync/madrasati-sync.service.ts";
import { runAuthenticatedMadrasatiMockApply } from "../../../platform/integration/connectors/madrasati/madrasati-apply.server.ts";
import { runAuthenticatedMadrasatiDryRunPreview } from "../../../platform/integration/connectors/madrasati/madrasati-preview.server.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";
import type { MadrasatiTimetableEntry } from "../provider/models.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FUNCTIONS_FILE = "src/platform/integration/connectors/madrasati/madrasati.functions.ts";
const APPLY_CORE_FILE = "src/platform/integration/connectors/madrasati/madrasati-apply.server.ts";
const SYNC_FILE = "src/features/madrasati/sync/madrasati-sync.service.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type StoredRow = TeacherTimetableDraft & { teacherId: string };

function createMemoryWriter(initial: StoredRow[] = []) {
  let rows = [...initial];
  let saveCalls = 0;
  let lessonSessionWrites = 0;

  const client = {
    from(table: string) {
      if (table === "lesson_sessions") {
        return {
          insert() {
            lessonSessionWrites += 1;
            throw new Error("lesson_sessions must not be written by mock apply");
          },
          update() {
            lessonSessionWrites += 1;
            throw new Error("lesson_sessions must not be written by mock apply");
          },
          upsert() {
            lessonSessionWrites += 1;
            throw new Error("lesson_sessions must not be written by mock apply");
          },
          delete() {
            lessonSessionWrites += 1;
            throw new Error("lesson_sessions must not be written by mock apply");
          },
        };
      }
      return {};
    },
  };

  return {
    client,
    getRows: () => rows,
    getSaveCalls: () => saveCalls,
    getLessonSessionWrites: () => lessonSessionWrites,
    saveTimetable: async (entries: TeacherTimetableDraft[], auth: { userId: string }) => {
      saveCalls += 1;
      rows = entries.map((entry) => ({ ...entry, teacherId: auth.userId }));
    },
  };
}

function failingTimetableProvider(): MadrasatiProvider {
  const base = new MockMadrasatiProvider();
  return {
    connect: () => base.connect(),
    inspectAuthenticationPage: () => base.inspectAuthenticationPage(),
    beginAuthentication: () => base.beginAuthentication(),
    disconnect: () => base.disconnect(),
    getConnectionStatus: () => base.getConnectionStatus(),
    getTeacherProfile: () => base.getTeacherProfile(),
    getClasses: () => base.getClasses(),
    getSubjects: () => base.getSubjects(),
    async getTimetable() {
      throw new Error("simulated incomplete timetable fetch");
    },
  };
}

describe("mapMadrasatiTimetableToTeacherDrafts", () => {
  it("maps normalized Madrasati rows to teacher timetable drafts without inventing AY/semester", () => {
    const drafts = mapMadrasatiTimetableToTeacherDrafts(MOCK_MADRASATI_TIMETABLE);
    assert.equal(drafts.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(drafts[0]?.dayOfWeek, 0);
    assert.equal(drafts[0]?.period, 1);
    assert.equal(drafts[0]?.subject, "لغتي الخالدة");
    assert.equal(drafts[0]?.active, true);
    assert.equal("academic_year_id" in (drafts[0] as object), false);
    assert.equal("semester_id" in (drafts[0] as object), false);
  });
});

describe("Madrasati mock timetable apply", () => {
  it("successful mock apply writes normalized timetable rows owned by auth user", async () => {
    const store = createMemoryWriter();
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { saveTimetable: store.saveTimetable },
    );

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.dryRun, false);
    assert.equal(result.isMockApply, true);
    assert.equal(result.waraqaUserId, USER_A);
    assert.equal(result.slotsWritten, MOCK_MADRASATI_TIMETABLE.length);
    assert.equal(result.disclaimer, MADRASATI_MOCK_APPLY_DISCLAIMER);
    assert.equal(store.getSaveCalls(), 1);
    assert.ok(store.getRows().every((row) => row.teacherId === USER_A));
    assert.equal(store.getRows().length, MOCK_MADRASATI_TIMETABLE.length);
  });

  it("client cannot provide another user id as owner", async () => {
    const store = createMemoryWriter();
    const forged = { userId: USER_B, teacherId: USER_B };
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { saveTimetable: store.saveTimetable },
    );
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.waraqaUserId, USER_A);
    assert.notEqual(result.waraqaUserId, forged.userId);
    assert.ok(store.getRows().every((row) => row.teacherId === USER_A));
  });

  it("rejects auth mismatch between waraqaUserId and context.userId", async () => {
    const store = createMemoryWriter();
    const sync = new MadrasatiSyncService(new MockMadrasatiProvider());
    await assert.rejects(
      () =>
        sync.applyMockTimetable(
          USER_B,
          { userId: USER_A, client: store.client },
          {
            saveTimetable: store.saveTimetable,
          },
        ),
      /mismatch|context\.userId/i,
    );
    assert.equal(store.getSaveCalls(), 0);
  });

  it("duplicate day+period input is normalized safely before apply", async () => {
    const store = createMemoryWriter();
    const provider = new MockMadrasatiProvider({
      timetable: [...MOCK_MADRASATI_TIMETABLE_WITH_ISSUES] as MadrasatiTimetableEntry[],
    });
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { provider, saveTimetable: store.saveTimetable },
    );
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.timetable.accepted.length, MOCK_MADRASATI_TIMETABLE.length);
    assert.ok(result.timetable.duplicates.length > 0);
    assert.ok(result.timetable.rejected.length > 0);
    const slotZero = store.getRows().filter((r) => r.dayOfWeek === 0 && r.period === 1);
    assert.equal(slotZero.length, 1);
    assert.equal(slotZero[0]?.subject, "لغتي الخالدة");
  });

  it("empty accepted timetable does not call saveTimetable and leaves existing rows", async () => {
    const existing: StoredRow[] = [
      {
        teacherId: USER_A,
        dayOfWeek: 0,
        period: 1,
        subject: "قديم",
        grade: "صف",
        className: "1",
        active: true,
      },
    ];
    const store = createMemoryWriter(existing);
    const provider = new MockMadrasatiProvider({ timetable: [] });
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { provider, saveTimetable: store.saveTimetable },
    );

    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(result.code, MADRASATI_APPLY_EMPTY_CODE);
    assert.equal(store.getSaveCalls(), 0);
    assert.equal(store.getRows().length, 1);
    assert.equal(store.getRows()[0]?.subject, "قديم");
  });

  it("incomplete source snapshot is rejected and does not wipe existing rows", async () => {
    const existing: StoredRow[] = [
      {
        teacherId: USER_A,
        dayOfWeek: 1,
        period: 2,
        subject: "قديم",
        grade: "صف",
        className: "1",
        active: true,
      },
    ];
    const store = createMemoryWriter(existing);
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { provider: failingTimetableProvider(), saveTimetable: store.saveTimetable },
    );

    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(result.code, MADRASATI_APPLY_INCOMPLETE_CODE);
    assert.equal(store.getSaveCalls(), 0);
    assert.equal(store.getRows()[0]?.subject, "قديم");
  });

  it("non-mock browser provider is rejected without writing", async () => {
    const store = createMemoryWriter([
      {
        teacherId: USER_A,
        dayOfWeek: 0,
        period: 1,
        subject: "قديم",
        grade: "صف",
        className: "1",
        active: true,
      },
    ]);
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      {
        provider: new MadrasatiBrowserAdapter(new UnavailableBrowserAutomation()),
        saveTimetable: store.saveTimetable,
      },
    );
    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.code === MADRASATI_APPLY_NOT_MOCK_CODE ||
        result.code === MADRASATI_APPLY_INCOMPLETE_CODE,
    );
    assert.equal(store.getSaveCalls(), 0);
  });

  it("re-applying the same complete snapshot is idempotent", async () => {
    const store = createMemoryWriter();
    const opts = { saveTimetable: store.saveTimetable };
    const auth = { userId: USER_A, client: store.client };
    const first = await runAuthenticatedMadrasatiMockApply(auth, opts);
    const second = await runAuthenticatedMadrasatiMockApply(auth, opts);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(store.getSaveCalls(), 2);
    assert.equal(store.getRows().length, MOCK_MADRASATI_TIMETABLE.length);
  });

  it("applying changed slots replaces the weekly snapshot", async () => {
    const store = createMemoryWriter();
    const auth = { userId: USER_A, client: store.client };
    await runAuthenticatedMadrasatiMockApply(auth, { saveTimetable: store.saveTimetable });

    const changed: MadrasatiTimetableEntry[] = [
      {
        dayOfWeek: 0,
        period: 1,
        subject: "مادة جديدة",
        grade: "الصف الأول المتوسط",
        className: "1",
      },
    ];
    const result = await runAuthenticatedMadrasatiMockApply(auth, {
      provider: new MockMadrasatiProvider({ timetable: changed }),
      saveTimetable: store.saveTimetable,
    });
    assert.equal(result.success, true);
    assert.equal(store.getRows().length, 1);
    assert.equal(store.getRows()[0]?.subject, "مادة جديدة");
  });

  it("lesson_sessions remain unchanged / unwritten by mock apply", async () => {
    const store = createMemoryWriter();
    const result = await runAuthenticatedMadrasatiMockApply(
      { userId: USER_A, client: store.client },
      { saveTimetable: store.saveTimetable },
    );
    assert.equal(result.success, true);
    assert.equal(store.getLessonSessionWrites(), 0);

    const syncSrc = readFileSync(join(ROOT, SYNC_FILE), "utf8");
    const applySrc = readFileSync(join(ROOT, APPLY_CORE_FILE), "utf8");
    assert.equal(/LessonSessionService|generateSessionsForDate/.test(syncSrc), false);
    assert.equal(/LessonSessionService|generateSessionsForDate/.test(applySrc), false);
    assert.equal(/\.from\(\s*["']lesson_sessions["']\s*\)/.test(syncSrc), false);
    assert.equal(/\.from\(\s*["']lesson_sessions["']\s*\)/.test(applySrc), false);
  });

  it("preview endpoint remains dry-run and does not write", async () => {
    const store = createMemoryWriter([
      {
        teacherId: USER_A,
        dayOfWeek: 0,
        period: 1,
        subject: "قديم",
        grade: "صف",
        className: "1",
        active: true,
      },
    ]);
    const preview = await runAuthenticatedMadrasatiDryRunPreview(USER_A);
    assert.equal(preview.dryRun, true);
    assert.equal(store.getSaveCalls(), 0);
    assert.equal(store.getRows()[0]?.subject, "قديم");

    const functionsSrc = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    assert.match(
      functionsSrc,
      /previewMadrasatiSync[\s\S]*runAuthenticatedMadrasatiDryRunPreview\(context\.userId\)/,
    );
    assert.match(functionsSrc, /export const applyMockMadrasatiTimetable/);
    assert.match(
      functionsSrc,
      /applyMockMadrasatiTimetable[\s\S]*middleware\(\[requireSupabaseAuth\]\)[\s\S]*context\.userId/,
    );
    assert.equal(/data\.userId|data\.teacherId|data\.profileId/.test(functionsSrc), false);
  });

  it("no real Madrasati/browser network call occurs in apply modules", () => {
    for (const relative of [APPLY_CORE_FILE, SYNC_FILE]) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      assert.equal(/\bfetch\s*\(/.test(source), false);
      assert.equal(/schools\.madrasati\.sa|playwright|puppeteer/i.test(source), false);
    }
  });

  it("documents fail-closed partial detection without inventing schema fields", () => {
    const source = readFileSync(join(ROOT, SYNC_FILE), "utf8");
    assert.match(source, /sourceComplete/);
    assert.match(source, /Fail closed/);
    assert.equal(/academic_year_id/.test(source), false);
  });
});
