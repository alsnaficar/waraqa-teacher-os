import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  decodeCalendarImportBase64,
  sniffCalendarImportMime,
  validateCalendarImportFile,
} from "./calendar-import.limits.ts";
import {
  CALENDAR_IMPORT_DUPLICATE_MESSAGE,
  CALENDAR_IMPORT_END_BEFORE_START_MESSAGE,
  CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE,
  CALENDAR_IMPORT_INVALID_DATE_MESSAGE,
  CALENDAR_IMPORT_MISSING_SEMESTER_MESSAGE,
  CALENDAR_IMPORT_MISSING_VARIANT_MESSAGE,
  CALENDAR_IMPORT_MISSING_YEAR_MESSAGE,
  assertCalendarImportScopeInput,
  buildCalendarImportDraft,
  decideCalendarImportApproval,
  evaluateCalendarImportItem,
  parseGregorianIsoDate,
  type CalendarImportScope,
  type ExistingCalendarException,
} from "./calendar-import.logic.ts";
import { parseCalendarImportAiResponse } from "./calendar-import.extraction.ts";
import {
  approveOfficialCalendarImport,
  extractOfficialCalendarDraft,
} from "./calendar-import.service.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOGIC_FILE = "src/features/calendar/services/calendar-import.logic.ts";
const SERVICE_FILE = "src/features/calendar/services/calendar-import.service.ts";
const EXTRACT_FILE = "src/features/calendar/services/calendar-import.extraction.ts";
const FUNCTIONS_FILE = "src/platform/calendar/calendar-import.functions.ts";
const PANEL_FILE = "src/features/calendar/components/calendar-import-panel.tsx";
const ADMIN_PAGE = "src/routes/_authenticated/admin/academic-calendar.tsx";
const ENGINE_FILE = "src/features/planner/services/planner-engine.ts";
const LIFECYCLE_FILE = "src/features/planner/services/semester-plan-lifecycle.ts";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const YEAR_ID = "11111111-1111-4111-8111-111111111111";
const SEMESTER_ID = "22222222-2222-4222-8222-222222222222";
const GENERAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WESTERN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EXISTING_EXCEPTION_ID = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "neq" | "in"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === "in") return Array.isArray(f.value) && f.value.includes(v);
    if (f.op === "neq") return v !== f.value;
    return v === f.value;
  });
}

function createMockClient(db: Record<string, Row[]>) {
  const writes = {
    inserts: [] as Array<{ table: string; rows: Row[] }>,
    updates: [] as Array<{ table: string; patch: Row }>,
  };

  const client = {
    from(table: string) {
      const filters: Filter[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;

      const runSelect = (): Row[] => {
        let rows = (db[table] ?? []).filter((row) => matches(row, filters));
        for (const ord of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[ord.column];
            const bv = b[ord.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return ord.ascending ? -1 : 1;
            return 1;
          });
        }
        return rows;
      };

      const execute = async (mode: "many" | "single" | "maybe") => {
        if (pendingInsert) {
          writes.inserts.push({ table, rows: pendingInsert });
          const inserted: Row[] = [];
          for (const row of pendingInsert) {
            const saved = {
              id: (row.id as string) ?? randomUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...row,
            };
            db[table] = [...(db[table] ?? []), saved];
            inserted.push(saved);
          }
          const data = mode === "many" ? inserted : (inserted[0] ?? null);
          return { data, error: null };
        }

        if (pendingUpdate) {
          writes.updates.push({ table, patch: pendingUpdate });
          const rows = (db[table] ?? []).filter((row) => matches(row, filters));
          for (const row of rows) {
            Object.assign(row, pendingUpdate, { updated_at: new Date().toISOString() });
          }
          return { data: mode === "many" ? rows : (rows[0] ?? null), error: null };
        }

        const rows = runSelect();
        if (mode === "many") return { data: rows, error: null };
        if (mode === "maybe") return { data: rows[0] ?? null, error: null };
        if (!rows[0]) return { data: null, error: { message: "not found" } };
        return { data: rows[0], error: null };
      };

      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert(row: Row | Row[]) {
          pendingInsert = Array.isArray(row) ? row : [row];
          return api;
        },
        update(row: Row) {
          pendingUpdate = row;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, op: "eq", value });
          return api;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, op: "in", value });
          return api;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push({ column, ascending: options?.ascending !== false });
          return api;
        },
        maybeSingle() {
          return execute("maybe");
        },
        single() {
          return execute("single");
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return execute("many").then(onFulfilled, onRejected);
        },
      };

      return api;
    },
  };

  return { client, db, writes };
}

function auth(userId: string, client: ReturnType<typeof createMockClient>["client"]) {
  return { userId, client: client as never };
}

function mockAdminClient(role: string | null) {
  const terminal = {
    async maybeSingle() {
      return {
        data: role == null ? null : { role },
        error: null,
      };
    },
  };
  const chain = {
    eq() {
      return {
        eq() {
          return terminal;
        },
        ...terminal,
      };
    },
  };
  return {
    from() {
      return {
        select() {
          return chain;
        },
      };
    },
  } as never;
}

function seedDb(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    academic_years: [
      {
        id: YEAR_ID,
        label: "العام الدراسي 1448-1449هـ",
        start_date: "2026-08-23",
        end_date: null,
        is_active: true,
        user_id: ADMIN,
      },
    ],
    semesters: [
      {
        id: SEMESTER_ID,
        academic_year_id: YEAR_ID,
        label: "الفصل الدراسي الأول",
        start_date: "2026-08-30",
        end_date: "2027-01-08",
        order_index: 1,
      },
    ],
    calendar_variants: [
      {
        id: GENERAL_ID,
        code: "GENERAL",
        label: "جميع المناطق",
        is_default: true,
        is_selectable: true,
        sort_order: 0,
      },
      {
        id: WESTERN_ID,
        code: "WESTERN",
        label: "المنطقة الغربية",
        is_default: false,
        is_selectable: true,
        sort_order: 1,
      },
    ],
    calendar_exceptions: [],
    ...extra,
  };
}

const SCOPE: CalendarImportScope = {
  academicYearId: YEAR_ID,
  semesterId: SEMESTER_ID,
  variantCode: "GENERAL",
  variantId: GENERAL_ID,
  academicYearLabel: "العام الدراسي 1448-1449هـ",
  semesterLabel: "الفصل الدراسي الأول",
  variantLabel: "جميع المناطق",
  yearStart: "2026-08-23",
  yearEnd: null,
  semesterStart: "2026-08-30",
  semesterEnd: "2027-01-08",
};

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
}

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function aiReturning(items: unknown[]) {
  return {
    models: {
      async generateContent() {
        return { text: JSON.stringify({ items }) };
      },
    },
  };
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `item-${idSeq}`;
}

describe("calendar import draft extraction", () => {
  it("parses PDF/image AI JSON into a draft without guessing Hijri", () => {
    const raw = parseCalendarImportAiResponse(`\`\`\`json
{"items":[{"kind":"holiday","title":"اليوم الوطني","startDate":"2026-09-23","endDate":"2026-09-23","confidence":0.98}]}
\`\`\``);
    const draft = buildCalendarImportDraft(SCOPE, raw, [], nextId);
    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0]?.kind, "holiday");
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(draft.variantCode, "GENERAL");
  });

  it("accepts PDF JPEG and PNG magic bytes only", () => {
    assert.equal(sniffCalendarImportMime(pdfBytes()), "application/pdf");
    assert.equal(sniffCalendarImportMime(jpegBytes()), "image/jpeg");
    assert.equal(sniffCalendarImportMime(pngBytes()), "image/png");
    assert.equal(validateCalendarImportFile({ bytes: pdfBytes() }).mime, "application/pdf");
    assert.throws(() =>
      validateCalendarImportFile({ bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]) }),
    );
  });
});

describe("calendar import item validation", () => {
  it("marks a valid holiday ready", () => {
    const item = evaluateCalendarImportItem(
      {
        kind: "holiday",
        title: "اليوم الوطني",
        startDate: "2026-09-23",
        endDate: "2026-09-23",
        confidence: 0.98,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.status, "ready");
    assert.equal(item.selected, true);
  });

  it("keeps a date range ready when it sits inside the semester", () => {
    const item = evaluateCalendarImportItem(
      {
        kind: "break",
        title: "إجازة الخريف",
        startDate: "2026-11-15",
        endDate: "2026-11-19",
        confidence: 0.91,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.status, "ready");
    assert.equal(item.startDate, "2026-11-15");
    assert.equal(item.endDate, "2026-11-19");
  });

  it("marks an invalid date as needs_review", () => {
    const item = evaluateCalendarImportItem(
      {
        kind: "holiday",
        title: "تاريخ باطل",
        startDate: "2026-02-30",
        endDate: "2026-02-30",
        confidence: 0.99,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.status, "needs_review");
    assert.match(item.reviewReason ?? "", new RegExp(CALENDAR_IMPORT_INVALID_DATE_MESSAGE));
  });

  it("marks end before start as needs_review", () => {
    const item = evaluateCalendarImportItem(
      {
        kind: "holiday",
        title: "نطاق مقلوب",
        startDate: "2026-12-10",
        endDate: "2026-12-01",
        confidence: 0.99,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.status, "needs_review");
    assert.match(item.reviewReason ?? "", new RegExp(CALENDAR_IMPORT_END_BEFORE_START_MESSAGE));
  });

  it("does not convert Hijri-only dates", () => {
    const parsed = parseGregorianIsoDate("1448-03-15");
    assert.equal(parsed.iso, null);
    assert.equal(parsed.reason, CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE);
    const item = evaluateCalendarImportItem(
      {
        kind: "holiday",
        title: "إجازة هجرية",
        hijriStart: "15 ربيع الأول 1448",
        confidence: 0.9,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.status, "needs_review");
    assert.match(item.reviewReason ?? "", new RegExp(CALENDAR_IMPORT_HIJRI_ONLY_MESSAGE));
    assert.equal(item.startDate, "");
  });

  it("marks an ambiguous missing date as needs_review", () => {
    const item = evaluateCalendarImportItem(
      {
        kind: "exam",
        title: "اختبار",
        startDate: "2026-12-01",
        confidence: 0.99,
      },
      SCOPE,
      "1",
    );
    assert.equal(item.endDate, "2026-12-01");
    assert.equal(item.status, "ready");
    const ambiguous = evaluateCalendarImportItem(
      { kind: "exam", title: "اختبار بلا تاريخ", confidence: 0.99 },
      SCOPE,
      "2",
    );
    assert.equal(ambiguous.status, "needs_review");
  });
});

describe("calendar import scope guards", () => {
  it("rejects a missing region/variant", () => {
    assert.throws(
      () =>
        assertCalendarImportScopeInput({
          academicYearId: YEAR_ID,
          semesterId: SEMESTER_ID,
        }),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_IMPORT_MISSING_VARIANT_MESSAGE,
    );
  });

  it("rejects a missing semester", () => {
    assert.throws(
      () =>
        assertCalendarImportScopeInput({
          academicYearId: YEAR_ID,
          variantCode: "GENERAL",
        }),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_IMPORT_MISSING_SEMESTER_MESSAGE,
    );
  });

  it("rejects a missing academic year", () => {
    assert.throws(
      () =>
        assertCalendarImportScopeInput({
          semesterId: SEMESTER_ID,
          variantCode: "GENERAL",
        }),
      (err: unknown) =>
        err instanceof Error && err.message === CALENDAR_IMPORT_MISSING_YEAR_MESSAGE,
    );
  });
});

describe("calendar import duplicates", () => {
  it("flags an existing exception as duplicate without mutating it", () => {
    const existing: ExistingCalendarException[] = [
      {
        variantId: GENERAL_ID,
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        kind: "holiday",
        startDate: "2026-09-23",
        endDate: "2026-09-23",
        title: "اليوم الوطني",
      },
    ];
    const draft = buildCalendarImportDraft(
      SCOPE,
      [
        {
          kind: "holiday",
          title: "اليوم الوطني",
          startDate: "2026-09-23",
          endDate: "2026-09-23",
          confidence: 0.99,
        },
      ],
      existing,
      nextId,
    );
    assert.equal(draft.items[0]?.status, "duplicate");
    assert.equal(draft.items[0]?.reviewReason, CALENDAR_IMPORT_DUPLICATE_MESSAGE);
    assert.equal(existing[0]?.title, "اليوم الوطني");
  });
});

describe("calendar import GENERAL and WESTERN", () => {
  it("stores GENERAL exceptions on the GENERAL variant only", () => {
    const decisions = decideCalendarImportApproval({
      scope: SCOPE,
      existing: [],
      items: [
        {
          kind: "holiday",
          title: "اليوم الوطني",
          startDate: "2026-09-23",
          endDate: "2026-09-23",
          selected: true,
        },
      ],
    });
    assert.equal(decisions[0]?.outcome, "insert");
    if (decisions[0]?.outcome === "insert") {
      assert.equal(decisions[0].row.variant_id, GENERAL_ID);
      assert.equal(decisions[0].row.action, "add");
    }
  });

  it("stores WESTERN exceptions on WESTERN without copying GENERAL", () => {
    const westernScope = {
      ...SCOPE,
      variantCode: "WESTERN" as const,
      variantId: WESTERN_ID,
      variantLabel: "المنطقة الغربية",
    };
    const decisions = decideCalendarImportApproval({
      scope: westernScope,
      existing: [
        {
          variantId: GENERAL_ID,
          academicYearId: YEAR_ID,
          semesterId: SEMESTER_ID,
          kind: "holiday",
          startDate: "2026-09-23",
          endDate: "2026-09-23",
          title: "اليوم الوطني",
        },
      ],
      items: [
        {
          kind: "holiday",
          title: "إجازة تأسيس غربية",
          startDate: "2026-11-01",
          endDate: "2026-11-01",
          selected: true,
        },
      ],
    });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.outcome, "insert");
    if (decisions[0]?.outcome === "insert") {
      assert.equal(decisions[0].row.variant_id, WESTERN_ID);
      assert.equal(decisions[0].row.title, "إجازة تأسيس غربية");
    }
  });
});

describe("calendar import extract vs approve", () => {
  it("does not INSERT during draft extraction", async () => {
    const { client, db, writes } = createMockClient(seedDb());
    const draft = await extractOfficialCalendarDraft(
      auth(ADMIN, client),
      mockAdminClient("admin"),
      {
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        variantCode: "GENERAL",
        fileBase64: b64(pdfBytes()),
        declaredMime: "application/pdf",
        declaredName: "calendar.pdf",
      },
      {
        ai: aiReturning([
          {
            kind: "holiday",
            title: "اليوم الوطني",
            startDate: "2026-09-23",
            endDate: "2026-09-23",
            confidence: 0.98,
          },
        ]),
      },
    );
    assert.equal(draft.items[0]?.status, "ready");
    assert.equal(db.calendar_exceptions?.length, 0);
    assert.equal(writes.inserts.length, 0);
    assert.equal(writes.updates.length, 0);
  });

  it("inserts approved ready items into calendar_exceptions", async () => {
    const { client, db, writes } = createMockClient(seedDb());
    const result = await approveOfficialCalendarImport(
      auth(ADMIN, client),
      mockAdminClient("admin"),
      {
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        variantCode: "GENERAL",
        items: [
          {
            kind: "holiday",
            title: "اليوم الوطني",
            startDate: "2026-09-23",
            endDate: "2026-09-23",
            selected: true,
          },
        ],
      },
    );
    assert.equal(result.insertedCount, 1);
    assert.equal(db.calendar_exceptions?.length, 1);
    assert.equal(db.calendar_exceptions?.[0]?.kind, "holiday");
    assert.equal(db.calendar_exceptions?.[0]?.variant_id, GENERAL_ID);
    assert.equal(db.calendar_exceptions?.[0]?.action, "add");
    assert.equal(db.calendar_exceptions?.[0]?.starts_at, "2026-09-23");
    assert.equal(
      writes.inserts.every((entry) => entry.table === "calendar_exceptions"),
      true,
    );
  });

  it("rejects teacher extraction and approval", async () => {
    const { client, db, writes } = createMockClient(seedDb());
    await assert.rejects(
      () =>
        extractOfficialCalendarDraft(
          auth(TEACHER, client),
          mockAdminClient(null),
          {
            academicYearId: YEAR_ID,
            semesterId: SEMESTER_ID,
            variantCode: "GENERAL",
            fileBase64: b64(jpegBytes()),
            declaredMime: "image/jpeg",
            declaredName: "calendar.jpg",
          },
          { ai: aiReturning([]) },
        ),
      /مديري النظام/,
    );
    await assert.rejects(
      () =>
        approveOfficialCalendarImport(auth(TEACHER, client), mockAdminClient(null), {
          academicYearId: YEAR_ID,
          semesterId: SEMESTER_ID,
          variantCode: "GENERAL",
          items: [
            {
              kind: "holiday",
              title: "اليوم الوطني",
              startDate: "2026-09-23",
              endDate: "2026-09-23",
              selected: true,
            },
          ],
        }),
      /مديري النظام/,
    );
    assert.equal(db.calendar_exceptions?.length, 0);
    assert.equal(writes.inserts.length, 0);
  });

  it("does not modify an existing exception when a duplicate is approved", async () => {
    const existingRow = {
      id: EXISTING_EXCEPTION_ID,
      variant_id: GENERAL_ID,
      academic_year_id: YEAR_ID,
      semester_id: SEMESTER_ID,
      kind: "holiday",
      action: "add",
      starts_at: "2026-09-23",
      ends_at: "2026-09-23",
      title: "اليوم الوطني",
      is_teaching_day: false,
      is_remote: false,
    };
    const { client, db, writes } = createMockClient(
      seedDb({ calendar_exceptions: [{ ...existingRow }] }),
    );
    const result = await approveOfficialCalendarImport(
      auth(ADMIN, client),
      mockAdminClient("admin"),
      {
        academicYearId: YEAR_ID,
        semesterId: SEMESTER_ID,
        variantCode: "GENERAL",
        items: [
          {
            kind: "holiday",
            title: "اليوم الوطني",
            startDate: "2026-09-23",
            endDate: "2026-09-23",
            selected: true,
          },
        ],
      },
    );
    assert.equal(result.insertedCount, 0);
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.duplicates[0]?.message, CALENDAR_IMPORT_DUPLICATE_MESSAGE);
    assert.equal(db.calendar_exceptions?.length, 1);
    assert.equal(db.calendar_exceptions?.[0]?.id, EXISTING_EXCEPTION_ID);
    assert.equal(db.calendar_exceptions?.[0]?.title, "اليوم الوطني");
    assert.equal(writes.inserts.length, 0);
    assert.equal(writes.updates.length, 0);
  });

  it("does not mutate academic_years, semesters, or planner tables on approve", async () => {
    const { client, db, writes } = createMockClient(seedDb());
    const yearBefore = { ...db.academic_years![0] };
    const semesterBefore = { ...db.semesters![0] };
    await approveOfficialCalendarImport(auth(ADMIN, client), mockAdminClient("admin"), {
      academicYearId: YEAR_ID,
      semesterId: SEMESTER_ID,
      variantCode: "WESTERN",
      items: [
        {
          kind: "holiday",
          title: "استثناء غربي",
          startDate: "2026-10-01",
          endDate: "2026-10-01",
          selected: true,
        },
      ],
    });
    assert.deepEqual(db.academic_years?.[0], yearBefore);
    assert.deepEqual(db.semesters?.[0], semesterBefore);
    assert.equal(
      writes.inserts.every((entry) => entry.table === "calendar_exceptions"),
      true,
    );
    assert.equal(db.calendar_exceptions?.[0]?.variant_id, WESTERN_ID);
    assert.equal(writes.updates.length, 0);
  });

  it("decodes uploaded base64 before Gemini and never persists the file", () => {
    const encoded = b64(pdfBytes());
    const decoded = decodeCalendarImportBase64(encoded);
    assert.equal(sniffCalendarImportMime(decoded), "application/pdf");
    const service = readFileSync(join(ROOT, SERVICE_FILE), "utf8");
    assert.equal(/storage\.from|billing-receipts/.test(service), false);
  });
});

describe("calendar import source guards", () => {
  it("does not use DEFAULT_CALENDAR or a 1447 fallback", () => {
    for (const rel of [LOGIC_FILE, SERVICE_FILE, EXTRACT_FILE, FUNCTIONS_FILE, PANEL_FILE]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      assert.equal(/DEFAULT_CALENDAR/.test(src), false, rel);
      assert.equal(/1447/.test(src), false, rel);
    }
  });

  it("does not modify planner engine or semester-plan lifecycle", () => {
    const importTouched = [
      LOGIC_FILE,
      SERVICE_FILE,
      EXTRACT_FILE,
      FUNCTIONS_FILE,
      PANEL_FILE,
      ADMIN_PAGE,
    ]
      .map((rel) => readFileSync(join(ROOT, rel), "utf8"))
      .join("\n");
    assert.equal(
      /planner-engine|semester-plan-lifecycle|loadCalendarConfig/.test(importTouched),
      false,
    );
    const engine = readFileSync(join(ROOT, ENGINE_FILE), "utf8");
    const lifecycle = readFileSync(join(ROOT, LIFECYCLE_FILE), "utf8");
    assert.equal(/calendar-import/.test(engine), false);
    assert.equal(/calendar-import/.test(lifecycle), false);
  });

  it("keeps extract as draft-only and approve as JWT admin INSERT", () => {
    const service = readFileSync(join(ROOT, SERVICE_FILE), "utf8");
    const extractFn = service.slice(
      service.indexOf("export async function extractOfficialCalendarDraft"),
      service.indexOf("export async function approveOfficialCalendarImport"),
    );
    const approveFn = service.slice(
      service.indexOf("export async function approveOfficialCalendarImport"),
    );
    assert.equal(/\.insert\(/.test(extractFn), false);
    assert.match(approveFn, /\.from\("calendar_exceptions"\)\.insert/);
    assert.equal(/\.from\("academic_years"\)\.update/.test(service), false);
    assert.equal(/\.from\("semesters"\)\.update/.test(service), false);
    assert.equal(/\.from\("academic_years"\)\.insert/.test(service), false);
    assert.equal(/\.from\("semesters"\)\.insert/.test(service), false);

    const functions = readFileSync(join(ROOT, FUNCTIONS_FILE), "utf8");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /assertAdmin/);
    assert.equal(/userId:\s*data\.userId/.test(functions), false);
    assert.equal(/service_role/.test(functions), false);
  });

  it("exposes year-tree-driven GENERAL/WESTERN import context synced with the dialog", () => {
    const panel = readFileSync(join(ROOT, PANEL_FILE), "utf8");
    assert.equal(/admin-page-calendar-variant/.test(panel), false);
    assert.match(panel, /admin-import-calendar-variant/);
    assert.match(panel, /listAdminCalendarVariants/);
    assert.match(panel, /onVariantCodeChange/);
    assert.match(panel, /variantCode: controlledVariantCode/);
    assert.match(panel, /جميع المناطق/);
    assert.match(panel, /المنطقة الغربية/);
    assert.equal(/calendar_variant_id/.test(panel), false);
    assert.equal(/from\("academic_years"\)\.update/.test(panel), false);
    const admin = readFileSync(join(ROOT, ADMIN_PAGE), "utf8");
    assert.match(admin, /year-variant-tree/);
    assert.match(admin, /data-calendar-variant/);
    assert.match(admin, /selectedVariantCode/);
    assert.match(admin, /listAdminCalendarVariants/);
    assert.equal(/calendar_variant_id/.test(admin), false);
  });
});
