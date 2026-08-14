import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadDistributionDraft,
  previewDistributionDraftAuthorized,
} from "./distribution-import.ts";
import {
  DEFAULT_DISTRIBUTION_WORKSHEET,
  DISTRIBUTION_CAPACITY_UNKNOWN_NOTE,
  DISTRIBUTION_CURRICULUM_NOT_FOUND_MESSAGE,
  DISTRIBUTION_DUPLICATE_ORDER_MESSAGE,
  DISTRIBUTION_EMPTY_SHEET_MESSAGE,
  DISTRIBUTION_EMPTY_UNIT_MESSAGE,
  DISTRIBUTION_INVALID_LESSON_ID_MESSAGE,
  DISTRIBUTION_MISSING_CURRICULUM_ID_MESSAGE,
  DISTRIBUTION_MISSING_ENV_MESSAGE,
  DISTRIBUTION_MISSING_LESSON_MESSAGE,
  DISTRIBUTION_NON_NUMERIC_PERIODS_MESSAGE,
  DISTRIBUTION_NON_SEQUENTIAL_ORDER_MESSAGE,
  DISTRIBUTION_NO_ROWS_MESSAGE,
  DISTRIBUTION_PLAN_CONTEXT_UNAVAILABLE_NOTE,
  DISTRIBUTION_SCHEDULE_WORKSHEET_MESSAGE,
  DISTRIBUTION_ZERO_PERIODS_MESSAGE,
  IGNORED_DISTRIBUTION_HEADERS,
  applyCurriculumMatches,
  assertDistributionWorksheetName,
  buildDistributionSummary,
  missingDistributionColumnsMessage,
  parseDistributionSheet,
  sumDistributionPeriods,
  toDistributionValuesRange,
  withDistributionPlanContext,
} from "./distribution-import.logic.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOGIC_FILE = join(ROOT, "src/features/planner/services/distribution-import.logic.ts");
const SERVICE_FILE = join(ROOT, "src/features/planner/services/distribution-import.ts");
const FUNCTIONS_FILE = join(ROOT, "src/features/planner/distribution-import.functions.ts");
const PANEL_FILE = join(ROOT, "src/features/planner/components/distribution-import-panel.tsx");
const DRIVE_FILE = join(ROOT, "src/features/planner/drive.functions.ts");
const SHEETS_FILE = join(ROOT, "src/features/planner/sheets.functions.ts");
const ENGINE_FILE = join(ROOT, "src/features/planner/services/planner-engine.ts");
const RESOLVER_FILE = join(ROOT, "src/features/calendar/services/resolve-calendar.ts");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_LESSON_ID = "22222222-2222-4222-8222-222222222222";
const YEAR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEMESTER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GRADE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUBJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PLAN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function mockAdminClient(options: {
  role: string | null;
  errorMessage?: string;
  curriculumLessons?: Array<{ id: string; title: string }>;
}): { client: never } {
  const roleTerminal = {
    async maybeSingle() {
      if (options.errorMessage) {
        return { data: null, error: { message: options.errorMessage } };
      }
      return {
        data: options.role == null ? null : { role: options.role },
        error: null,
      };
    },
  };

  const client = {
    from(table: string) {
      if (table === "curriculum_lessons") {
        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                const rows = (options.curriculumLessons ?? []).filter((row) =>
                  ids.includes(row.id),
                );
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return roleTerminal;
                },
                ...roleTerminal,
              };
            },
          };
        },
      };
    },
  };
  return { client: client as never };
}

function disposablePrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function validRows(): string[][] {
  return [
    ["order", "unit", "lesson", "periods", "notes", "curriculum_lesson_id"],
    ["1", "الوحدة الأولى", "الدرس الأول", "2", "ملاحظة", LESSON_ID],
    ["2", "الوحدة الثانية", "الدرس الثاني", "1", "", LESSON_ID],
  ];
}

function googleEnv() {
  return {
    GOOGLE_SHEETS_CLIENT_EMAIL: "sa@example.com",
    GOOGLE_SHEETS_PRIVATE_KEY: disposablePrivateKeyPem(),
    GOOGLE_SHEET_ID: "sheet-abc",
  };
}

describe("distribution worksheet guards", () => {
  it("defaults to التوزيع and rejects Schedule", () => {
    assert.equal(assertDistributionWorksheetName(undefined), DEFAULT_DISTRIBUTION_WORKSHEET);
    assert.equal(DEFAULT_DISTRIBUTION_WORKSHEET, "التوزيع");
    assert.throws(
      () => assertDistributionWorksheetName("Schedule"),
      (err: unknown) =>
        err instanceof Error && err.message === DISTRIBUTION_SCHEDULE_WORKSHEET_MESSAGE,
    );
    assert.throws(() => assertDistributionWorksheetName("Schedule!"));
    assert.match(toDistributionValuesRange("التوزيع"), /^'التوزيع'!A1:Z5000$/);
  });
});

describe("distribution preview summary", () => {
  it("builds a correct summary and total periods", () => {
    const draft = parseDistributionSheet(validRows(), {
      spreadsheetId: "sheet-abc",
      worksheetName: "التوزيع",
    });
    assert.equal(draft.summary.itemCount, 2);
    assert.equal(draft.summary.totalPeriods, 3);
    assert.equal(sumDistributionPeriods(draft.items), 3);
    assert.equal(draft.summary.readyCount, 2);
    assert.equal(draft.summary.reviewCount, 0);
    assert.equal(draft.summary.errorCount, 0);
    assert.equal(draft.summary.warningCount, 0);
    assert.equal(draft.capacity.totalPeriods, 3);
    assert.equal(draft.capacity.status, "unknown");
    assert.equal(draft.capacity.availableSlots, null);
    assert.equal(draft.capacity.delta, null);
    assert.equal(draft.capacity.comparison, null);
    assert.equal(draft.capacity.note, DISTRIBUTION_CAPACITY_UNKNOWN_NOTE);
    assert.deepEqual(buildDistributionSummary(draft.items, [], []), draft.summary);
  });
});

describe("parseDistributionSheet", () => {
  it("parses required and optional columns into a structured draft", () => {
    const draft = parseDistributionSheet(validRows(), {
      spreadsheetId: "sheet-abc",
      worksheetName: "التوزيع",
    });
    assert.equal(draft.spreadsheetId, "sheet-abc");
    assert.equal(draft.worksheetName, "التوزيع");
    assert.equal(draft.errors.length, 0);
    assert.equal(draft.items.length, 2);
    assert.equal(draft.items[0]?.curriculumMatch, "unchecked");
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(draft.items[0]?.order, 1);
    assert.equal(draft.items[0]?.periods, 2);
    assert.equal("hijriDate" in draft.items[0]!, false);
    assert.equal("gregorianDate" in draft.items[0]!, false);
    assert.equal("day" in draft.items[0]!, false);
    assert.equal("week" in draft.items[0]!, false);
    assert.equal("region" in draft.items[0]!, false);
  });

  it("accepts Arabic headers and Eastern Arabic digits", () => {
    const draft = parseDistributionSheet(
      [
        ["الترتيب", "الوحدة", "الدرس", "عدد الحصص", "ملاحظات", "معرف الدرس"],
        ["١", "نحو", "الفاعل", "٢", "", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.order, 1);
    assert.equal(draft.items[0]?.periods, 2);
    assert.equal(draft.items[0]?.status, "ready");
  });

  it("ignores dated Schedule columns and never copies them into the draft", () => {
    assert.ok(IGNORED_DISTRIBUTION_HEADERS.includes("hijri_date"));
    const draft = parseDistributionSheet(
      [
        [
          "order",
          "unit",
          "lesson",
          "periods",
          "hijri_date",
          "gregorian_date",
          "day",
          "week",
          "period",
          "region",
          "curriculum_lesson_id",
        ],
        [
          "1",
          "وحدة",
          "درس",
          "1",
          "1448-02-01",
          "2026-08-30",
          "sun",
          "1",
          "3",
          "western",
          LESSON_ID,
        ],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "ready");
    const item = draft.items[0] as unknown as Record<string, unknown>;
    assert.equal(item.day, undefined);
    assert.equal(item.week, undefined);
    assert.equal(JSON.stringify(draft), JSON.stringify(draft).replace(/2026-08-30/g, "REMOVED"));
  });

  it("returns a sheet-level error when required columns are missing", () => {
    const draft = parseDistributionSheet(
      [
        ["unit", "notes"],
        ["أ", "ب"],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.deepEqual(draft.items, []);
    assert.deepEqual(draft.errors, [
      missingDistributionColumnsMessage(["order", "lesson", "periods"]),
    ]);
    assert.equal(draft.summary.errorCount, 1);
  });

  it("returns a sheet-level error for an empty sheet or header-only sheet", () => {
    const empty = parseDistributionSheet([], { spreadsheetId: "id", worksheetName: "التوزيع" });
    assert.deepEqual(empty.errors, [DISTRIBUTION_EMPTY_SHEET_MESSAGE]);
    assert.equal(empty.summary.errorCount, 1);
    assert.deepEqual(
      parseDistributionSheet([["order", "lesson", "periods"]], {
        spreadsheetId: "id",
        worksheetName: "التوزيع",
      }).errors,
      [DISTRIBUTION_NO_ROWS_MESSAGE],
    );
  });
});

describe("distribution validation", () => {
  it("marks duplicate order as an error", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس أ", "1", LESSON_ID],
        ["1", "وحدة", "درس ب", "2", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "error");
    assert.equal(draft.items[1]?.status, "error");
    assert.ok((draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_DUPLICATE_ORDER_MESSAGE));
    assert.equal(draft.summary.readyCount, 0);
    assert.ok(draft.summary.errorCount >= 2);
  });

  it("marks a missing lesson as an error", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "", "2", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "error");
    assert.ok((draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_MISSING_LESSON_MESSAGE));
    assert.equal(draft.summary.errorCount, 1);
  });

  it("marks non-numeric periods as an error", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "abc", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "error");
    assert.ok(
      (draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_NON_NUMERIC_PERIODS_MESSAGE),
    );
  });

  it("marks zero periods as an error", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "0", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "error");
    assert.ok((draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_ZERO_PERIODS_MESSAGE));
    assert.equal(draft.summary.totalPeriods, 0);
  });

  it("does not reject a row for a missing curriculum lesson id; it needs review", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "2", ""],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "needs_review");
    assert.equal(draft.items[0]?.curriculumMatch, "missing_id");
    assert.ok(
      (draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_MISSING_CURRICULUM_ID_MESSAGE),
    );
    assert.equal(draft.summary.reviewCount, 1);
    assert.equal(draft.summary.errorCount, 0);
  });

  it("warns when unit is empty", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "", "درس", "2", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "needs_review");
    assert.ok((draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_EMPTY_UNIT_MESSAGE));
  });

  it("warns when order is not sequential", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس أ", "1", LESSON_ID],
        ["3", "وحدة", "درس ب", "1", LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.ok(draft.warnings.includes(DISTRIBUTION_NON_SEQUENTIAL_ORDER_MESSAGE));
    assert.ok(draft.summary.warningCount >= 1);
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(draft.items[1]?.status, "ready");
  });

  it("treats an invalid curriculum lesson id as an error", () => {
    const draft = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "1", "not-a-uuid"],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    assert.equal(draft.items[0]?.status, "error");
    assert.equal(draft.items[0]?.curriculumMatch, "invalid");
    assert.ok(
      (draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_INVALID_LESSON_ID_MESSAGE),
    );
  });
});

describe("curriculum matching", () => {
  it("marks a curriculum lesson as matched when it exists", () => {
    const parsed = parseDistributionSheet(validRows(), {
      spreadsheetId: "id",
      worksheetName: "التوزيع",
    });
    const draft = applyCurriculumMatches(parsed, [{ id: LESSON_ID, title: "الدرس الأول" }]);
    assert.equal(draft.items[0]?.curriculumMatch, "matched");
    assert.equal(draft.items[0]?.curriculumLessonTitle, "الدرس الأول");
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(draft.summary.readyCount, 2);
  });

  it("marks a missing catalog lesson as needs_review without rejecting the row", () => {
    const parsed = parseDistributionSheet(
      [
        ["order", "unit", "lesson", "periods", "curriculum_lesson_id"],
        ["1", "وحدة", "درس", "2", MISSING_LESSON_ID],
      ],
      { spreadsheetId: "id", worksheetName: "التوزيع" },
    );
    const draft = applyCurriculumMatches(parsed, []);
    assert.equal(draft.items[0]?.status, "needs_review");
    assert.equal(draft.items[0]?.curriculumMatch, "not_found");
    assert.ok(
      (draft.items[0]?.reviewReason ?? "").includes(DISTRIBUTION_CURRICULUM_NOT_FOUND_MESSAGE),
    );
    assert.equal(draft.summary.errorCount, 0);
    assert.equal(draft.summary.reviewCount, 1);
  });
});

describe("plan context", () => {
  it("keeps plan context null when the current path does not provide it", () => {
    const draft = parseDistributionSheet(validRows(), {
      spreadsheetId: "id",
      worksheetName: "التوزيع",
    });
    assert.equal(draft.context.available, false);
    assert.equal(draft.context.academicYearId, null);
    assert.equal(draft.context.semesterId, null);
    assert.equal(draft.context.gradeId, null);
    assert.equal(draft.context.subjectId, null);
    assert.equal(draft.context.semesterPlanId, null);
    assert.equal(draft.context.note, DISTRIBUTION_PLAN_CONTEXT_UNAVAILABLE_NOTE);
  });

  it("attaches provided plan context to the draft without inventing ids", () => {
    const parsed = parseDistributionSheet(validRows(), {
      spreadsheetId: "id",
      worksheetName: "التوزيع",
    });
    const draft = withDistributionPlanContext(parsed, {
      academicYearId: YEAR_ID,
      semesterId: SEMESTER_ID,
      gradeId: GRADE_ID,
      subjectId: SUBJECT_ID,
      semesterPlanId: PLAN_ID,
    });
    assert.equal(draft.context.available, true);
    assert.equal(draft.context.academicYearId, YEAR_ID);
    assert.equal(draft.context.semesterId, SEMESTER_ID);
    assert.equal(draft.context.gradeId, GRADE_ID);
    assert.equal(draft.context.subjectId, SUBJECT_ID);
    assert.equal(draft.context.semesterPlanId, PLAN_ID);
    assert.equal(draft.context.note, null);
  });
});

describe("previewDistributionDraftAuthorized", () => {
  it("rejects a teacher before any Google call", async () => {
    const { client } = mockAdminClient({ role: null });
    let fetchCalls = 0;
    await assert.rejects(
      () =>
        previewDistributionDraftAuthorized(
          client,
          TEACHER,
          { worksheetName: "التوزيع" },
          {
            env: googleEnv(),
            fetchImpl: async () => {
              fetchCalls += 1;
              throw new Error("privileged fetch must not run");
            },
          },
        ),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(fetchCalls, 0);
  });

  it("reads GOOGLE_SHEET_ID and matches curriculum lessons read-only", async () => {
    const { client } = mockAdminClient({
      role: "admin",
      curriculumLessons: [{ id: LESSON_ID, title: "الدرس الأول" }],
    });
    const result = await previewDistributionDraftAuthorized(
      client,
      ADMIN,
      { worksheetName: "التوزيع", academicYearId: YEAR_ID, semesterId: SEMESTER_ID },
      {
        env: googleEnv(),
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.includes("oauth2.googleapis.com/token")) {
            return new Response(JSON.stringify({ access_token: "test-token" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.includes("sheets.googleapis.com")) {
            assert.equal(init?.method, "GET");
            assert.match(url, /sheet-abc/);
            assert.doesNotMatch(url, /Schedule/);
            assert.equal(init?.body, undefined);
            return new Response(JSON.stringify({ values: validRows() }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          throw new Error(`unexpected url: ${url}`);
        },
      },
    );
    assert.equal(result.spreadsheetId, "sheet-abc");
    assert.equal(result.items[0]?.curriculumMatch, "matched");
    assert.equal(result.context.academicYearId, YEAR_ID);
    assert.equal(result.context.semesterId, SEMESTER_ID);
    assert.equal(result.context.gradeId, null);
    assert.equal(result.summary.totalPeriods, 3);
    assert.equal(result.capacity.status, "unknown");
  });

  it("throws when Google env is missing and does not fetch", async () => {
    const { client } = mockAdminClient({ role: "admin" });
    let fetchCalls = 0;
    await assert.rejects(
      () =>
        previewDistributionDraftAuthorized(
          client,
          ADMIN,
          {},
          {
            env: {},
            fetchImpl: async () => {
              fetchCalls += 1;
              throw new Error("must not run");
            },
          },
        ),
      (err: unknown) => err instanceof Error && err.message === DISTRIBUTION_MISSING_ENV_MESSAGE,
    );
    assert.equal(fetchCalls, 0);
  });
});

describe("loadDistributionDraft post-auth helper", () => {
  it("never grants access by itself when env is missing", async () => {
    await assert.rejects(
      () =>
        loadDistributionDraft(
          {},
          {
            env: {},
            fetchImpl: async () => {
              throw new Error("must not run when env missing");
            },
          },
        ),
      (err: unknown) => err instanceof Error && err.message === DISTRIBUTION_MISSING_ENV_MESSAGE,
    );
  });
});

describe("distribution import contracts", () => {
  it("requires JWT middleware and assertAdmin before the Google read", () => {
    const src = readFileSync(FUNCTIONS_FILE, "utf8");
    assert.match(src, /middleware\(\[requireSupabaseAuth\]\)/);
    assert.match(src, /previewDistributionDraftForAdmin\(supabaseAdmin,\s*context\.userId/);
    const service = readFileSync(SERVICE_FILE, "utf8");
    assert.match(service, /await assertAdmin\(client, actorId\)/);
    const assertIdx = service.indexOf("await assertAdmin");
    const loadIdx = service.indexOf("await loadDistributionDraft");
    assert.ok(assertIdx >= 0);
    assert.ok(loadIdx > assertIdx);
    assert.match(service, /return enrichPreviewDraft/);
    assert.match(src, /previewDistributionCapacity/);
    assert.doesNotMatch(src, /generateSchedule/);
    assert.doesNotMatch(src, /syncScheduleToDatabase/);
  });

  it("is read-only toward Sheets and the database", () => {
    const files = [LOGIC_FILE, SERVICE_FILE];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /\.insert\s*\(/);
      assert.doesNotMatch(src, /\.upsert\s*\(/);
      assert.doesNotMatch(src, /\.delete\s*\(/);
      assert.doesNotMatch(src, /\.from\([^)]*\)[\s\S]{0,200}\.update\s*\(/);
      assert.doesNotMatch(src, /syncSheetsToSupabaseAdmin/);
      assert.doesNotMatch(src, /syncCurriculumToSupabase/);
      assert.doesNotMatch(src, /generateSchedule/);
      assert.doesNotMatch(src, /planner-engine/);
      assert.doesNotMatch(src, /resolveCalendar/);
      assert.doesNotMatch(src, /resolve-calendar/);
      assert.doesNotMatch(src, /service_role/);
      assert.doesNotMatch(src, /spreadsheets\.values\.(update|append|batchUpdate|clear)/i);
      assert.doesNotMatch(src, /method:\s*"PUT"/);
      assert.doesNotMatch(src, /method:\s*"PATCH"/);
    }
    const service = readFileSync(SERVICE_FILE, "utf8");
    assert.match(service, /spreadsheets\.readonly/);
    assert.match(service, /\.select\("id, title"\)/);
    assert.match(service, /GOOGLE_SHEET_ID/);
  });

  it("does not call the planner engine or calendar resolver", () => {
    const engine = readFileSync(ENGINE_FILE, "utf8");
    const resolver = readFileSync(RESOLVER_FILE, "utf8");
    const drive = readFileSync(DRIVE_FILE, "utf8");
    const sheets = readFileSync(SHEETS_FILE, "utf8");
    assert.match(engine, /export async function generateSchedule/);
    assert.match(resolver, /export async function resolveCalendar/);
    assert.match(drive, /Schedule!A1:Z2000/);
    assert.match(sheets, /syncSheetsToSupabaseAdmin/);
    for (const file of [LOGIC_FILE, SERVICE_FILE, FUNCTIONS_FILE, PANEL_FILE]) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /loadCalendarConfig/);
      assert.doesNotMatch(src, /WESTERN/);
    }
  });

  it("preview UI can reload and later approve a snapshot without calling the planner", () => {
    const src = readFileSync(PANEL_FILE, "utf8");
    assert.match(src, /previewDistributionDraft/);
    assert.match(src, /previewDistributionCapacity/);
    assert.match(src, /إعادة القراءة/);
    assert.match(src, /approveDistributionSnapshot/);
    assert.match(src, /اعتماد وحفظ اللقطة/);
    assert.doesNotMatch(src, /generateSchedule/);
    assert.doesNotMatch(src, /planner-engine/);
  });
});
