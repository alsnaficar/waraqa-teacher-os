import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { fetchDriveScheduleRowsAuthorized, loadDriveScheduleRows } from "./drive.functions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DRIVE_FILE = join(ROOT, "src/features/planner/drive.functions.ts");
const SHEETS_FILE = join(ROOT, "src/features/planner/sheets.functions.ts");

const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockRoleClient(options: { role: string | null; errorMessage?: string }): {
  client: never;
} {
  const terminal = {
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

  const client = {
    from() {
      return {
        select() {
          return chain;
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

describe("fetchDriveScheduleRows authorization", () => {
  it("rejects an unauthorized (non-admin) caller before any Google/network call", async () => {
    const { client } = mockRoleClient({ role: null });
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      throw new Error("privileged fetch must not run");
    };

    await assert.rejects(
      () =>
        fetchDriveScheduleRowsAuthorized(client, TEACHER, {
          env: {
            GOOGLE_SHEETS_CLIENT_EMAIL: "sa@example.com",
            GOOGLE_SHEETS_PRIVATE_KEY: disposablePrivateKeyPem(),
            GOOGLE_SHEET_ID: "sheet-id",
          },
          fetchImpl,
        }),
      (err: unknown) => err instanceof Error && err.message.includes("Administrators"),
    );
    assert.equal(fetchCalls, 0);
  });

  it("rejects unauthorized callers without exposing sheet rows", async () => {
    const { client } = mockRoleClient({ role: null });
    let result: unknown = null;
    try {
      result = await fetchDriveScheduleRowsAuthorized(client, TEACHER, {
        env: {
          GOOGLE_SHEETS_CLIENT_EMAIL: "sa@example.com",
          GOOGLE_SHEETS_PRIVATE_KEY: disposablePrivateKeyPem(),
          GOOGLE_SHEET_ID: "sheet-id",
        },
        fetchImpl: async () => {
          throw new Error("must not run");
        },
      });
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.equal("rows" in (err as object), false);
      assert.doesNotMatch(err.message, /sheet|rows|access_token|BEGIN PRIVATE KEY/i);
      return;
    }
    assert.fail(`expected rejection, got ${JSON.stringify(result)}`);
  });

  it("allows an authorized admin and returns sheet rows from the Google path", async () => {
    const { client } = mockRoleClient({ role: "admin" });
    const privateKey = disposablePrivateKeyPem();
    const sheetRows = [
      [
        "hijri_date",
        "gregorian_date",
        "week",
        "day",
        "stage",
        "grade",
        "subject",
        "period",
        "lesson_title",
      ],
      ["1447-01-01", "2026-01-01", "1", "sun", "primary", "1", "رياضيات", "1", "درس"],
    ];

    const result = await fetchDriveScheduleRowsAuthorized(client, ADMIN, {
      env: {
        GOOGLE_SHEETS_CLIENT_EMAIL: "sa@example.com",
        GOOGLE_SHEETS_PRIVATE_KEY: privateKey,
        GOOGLE_SHEET_ID: "sheet-abc",
      },
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "test-token" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("sheets.googleapis.com")) {
          assert.match(url, /sheet-abc/);
          assert.match(url, /Schedule/);
          return new Response(JSON.stringify({ values: sheetRows }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, sheetRows);
  });

  it("loadDriveScheduleRows alone never grants access — privileged fetch is separate from auth", async () => {
    // Documented split: auth is in fetchDriveScheduleRowsAuthorized; this helper is post-auth only.
    const result = await loadDriveScheduleRows({
      env: {},
      fetchImpl: async () => {
        throw new Error("must not run when env missing");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing_env");
    assert.equal(result.rows, undefined);
  });
});

describe("fetchDriveScheduleRows server-fn contracts", () => {
  it("requires Supabase auth middleware and assertAdmin before sheet access", () => {
    const src = readFileSync(DRIVE_FILE, "utf8");
    assert.match(src, /middleware\(\[requireSupabaseAuth\]\)/);
    assert.match(src, /await assertAdmin\(client, actorId\)/);
    assert.match(src, /fetchDriveScheduleRowsAuthorized\(supabaseAdmin,\s*context\.userId\)/);

    const authorizedStart = src.indexOf("export async function fetchDriveScheduleRowsAuthorized");
    const authorizedBody = src.slice(
      authorizedStart,
      src.indexOf("export const fetchDriveScheduleRows"),
    );
    const assertIdx = authorizedBody.indexOf("await assertAdmin");
    const loadIdx = authorizedBody.indexOf("return loadDriveScheduleRows");
    assert.ok(assertIdx >= 0, "assertAdmin must be present");
    assert.ok(loadIdx > assertIdx, "assertAdmin must run before loadDriveScheduleRows");
  });

  it("matches admin Sheets authorization pattern (JWT userId → assertAdmin)", () => {
    const drive = readFileSync(DRIVE_FILE, "utf8");
    const sheets = readFileSync(SHEETS_FILE, "utf8");
    assert.match(sheets, /middleware\(\[requireSupabaseAuth\]\)/);
    assert.match(sheets, /await assertAdmin\(supabaseAdmin, context\.userId\)/);
    assert.match(drive, /middleware\(\[requireSupabaseAuth\]\)/);
    assert.match(drive, /context\.userId/);
    assert.doesNotMatch(drive, /assertAdmin\([^)]*email/i);
  });
});
