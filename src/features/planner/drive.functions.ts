/**
 * Server function: fetch a schedule spreadsheet from Google Drive via the
 * Google Sheets API. Authenticates using Google Service Account credentials.
 *
 * Authorization boundary (matches admin Sheets server functions):
 *   JWT → requireSupabaseAuth → assertAdmin → then Google SA sheet read.
 *
 * Required env:
 *   GOOGLE_SHEETS_CLIENT_EMAIL - Google Service Account client email
 *   GOOGLE_SHEETS_PRIVATE_KEY  - Google Service Account private key
 *   GOOGLE_SHEET_ID            - Google Spreadsheet ID
 */

import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";

import { assertAdmin } from "@/platform/auth/assert-admin";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

export interface DriveFetchResult {
  ok: boolean;
  reason?: string;
  rows?: string[][];
}

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type EnvLike = Record<string, string | undefined>;

export type LoadDriveScheduleRowsDeps = {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
};

// Native RS256 JWT assertion generation for Google Service Account authentication
async function getAccessToken(
  clientEmail: string,
  privateKeyStr: string,
  scopes: string[],
  fetchImpl: typeof fetch,
): Promise<string> {
  const cleanKey = privateKeyStr.replace(/\\n/g, "\n");
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64Encode = (obj: Record<string, unknown> | object) => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const headerB64 = base64Encode(header);
  const claimB64 = base64Encode(claimSet);
  const signInput = `${headerB64}.${claimB64}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer
    .sign(cleanKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signInput}.${signature}`;

  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain Google access token: ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Privileged Google Sheets read. Call only after authorization succeeds.
 * Does not perform auth itself — used by tests and the authorized entrypoint.
 */
export async function loadDriveScheduleRows(
  deps: LoadDriveScheduleRowsDeps = {},
): Promise<DriveFetchResult> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY;
  const sheetId = env.GOOGLE_SHEET_ID;
  const range = "Schedule!A1:Z2000";

  if (!clientEmail || !privateKey || !sheetId) {
    console.info(
      "[schedule/drive] Missing Google Service Account environment variables (GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, GOOGLE_SHEET_ID) — falling back.",
    );
    return { ok: false, reason: "missing_env" };
  }

  try {
    const token = await getAccessToken(
      clientEmail,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      fetchImpl,
    );

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[schedule/drive] Sheets API ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    const json = (await res.json()) as { values?: string[][] };
    const rows = json.values ?? [];
    console.info(`[schedule/drive] Loaded ${rows.length} rows from Sheets via Service Account.`);
    return { ok: true, rows };
  } catch (err) {
    console.error("[schedule/drive] Fetch failed:", err);
    return { ok: false, reason: "fetch_error" };
  }
}

/**
 * Admin-authorized schedule sheet load. Authorization runs before any Google call.
 */
export async function fetchDriveScheduleRowsAuthorized(
  client: AdminClient,
  actorId: string,
  deps: LoadDriveScheduleRowsDeps = {},
): Promise<DriveFetchResult> {
  await assertAdmin(client, actorId);
  return loadDriveScheduleRows(deps);
}

export const fetchDriveScheduleRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DriveFetchResult> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return fetchDriveScheduleRowsAuthorized(supabaseAdmin, context.userId);
  });
