/**
 * Read-only Google Sheets distribution load.
 * Reuses the existing Service Account env (GOOGLE_SHEET_ID + SA).
 * GET values only — never writes Sheets or Supabase.
 */

import crypto from "crypto";

import { assertAdmin } from "../../../platform/auth/assert-admin.ts";

import {
  DEFAULT_DISTRIBUTION_WORKSHEET,
  DISTRIBUTION_FETCH_FAILED_MESSAGE,
  DISTRIBUTION_MISSING_ENV_MESSAGE,
  applyCurriculumMatches,
  assertDistributionWorksheetName,
  markCurriculumLookupFailed,
  parseDistributionSheet,
  toDistributionValuesRange,
  withDistributionPlanContext,
  type CurriculumLessonMatch,
  type DistributionDraft,
  type DistributionPlanContext,
} from "./distribution-import.logic.ts";

type AdminClient = Awaited<
  typeof import("@/platform/database/supabase/client.server")
>["supabaseAdmin"];

type EnvLike = Record<string, string | undefined>;

export type LoadDistributionDraftDeps = {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  lookupCurriculumLessonIds?: (ids: string[]) => Promise<CurriculumLessonMatch[]>;
};

export type PreviewDistributionInput = {
  worksheetName?: string;
  academicYearId?: string;
  semesterId?: string;
  gradeId?: string;
  subjectId?: string;
  semesterPlanId?: string;
};

async function getAccessToken(
  clientEmail: string,
  privateKeyStr: string,
  scopes: string[],
  fetchImpl: typeof fetch,
): Promise<string> {
  const cleanKey = privateKeyStr.replace(/\\n/g, "\n");
  const header = { alg: "RS256", typ: "JWT" };
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

export async function loadDistributionDraft(
  input: PreviewDistributionInput = {},
  deps: LoadDistributionDraftDeps = {},
): Promise<DistributionDraft> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const worksheetName = assertDistributionWorksheetName(
    input.worksheetName || DEFAULT_DISTRIBUTION_WORKSHEET,
  );
  const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY;
  const spreadsheetId = env.GOOGLE_SHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error(DISTRIBUTION_MISSING_ENV_MESSAGE);
  }

  const range = toDistributionValuesRange(worksheetName);
  let token: string;
  try {
    token = await getAccessToken(
      clientEmail,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      fetchImpl,
    );
  } catch {
    throw new Error(DISTRIBUTION_FETCH_FAILED_MESSAGE);
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error(DISTRIBUTION_FETCH_FAILED_MESSAGE);
  }

  if (!res.ok) {
    throw new Error(DISTRIBUTION_FETCH_FAILED_MESSAGE);
  }

  const json = (await res.json()) as { values?: string[][] };
  return parseDistributionSheet(json.values ?? [], {
    spreadsheetId,
    worksheetName,
    context: planContextFromInput(input),
  });
}

function planContextFromInput(input: PreviewDistributionInput): Partial<DistributionPlanContext> {
  return {
    academicYearId: input.academicYearId ?? null,
    semesterId: input.semesterId ?? null,
    gradeId: input.gradeId ?? null,
    subjectId: input.subjectId ?? null,
    semesterPlanId: input.semesterPlanId ?? null,
  };
}

export async function lookupCurriculumLessonsReadOnly(
  client: AdminClient,
  ids: string[],
): Promise<CurriculumLessonMatch[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { data, error } = await client
    .from("curriculum_lessons")
    .select("id, title")
    .in("id", unique);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
  }));
}

async function enrichPreviewDraft(
  draft: DistributionDraft,
  input: PreviewDistributionInput,
  client: AdminClient,
  deps: LoadDistributionDraftDeps,
): Promise<DistributionDraft> {
  const withContext = withDistributionPlanContext(draft, planContextFromInput(input));
  const ids = withContext.items
    .map((item) => item.curriculumLessonId)
    .filter((id): id is string => Boolean(id));
  try {
    const existing = deps.lookupCurriculumLessonIds
      ? await deps.lookupCurriculumLessonIds(ids)
      : await lookupCurriculumLessonsReadOnly(client, ids);
    return applyCurriculumMatches(withContext, existing);
  } catch {
    return markCurriculumLookupFailed(withContext);
  }
}

export async function previewDistributionDraftAuthorized(
  client: AdminClient,
  actorId: string,
  input: PreviewDistributionInput = {},
  deps: LoadDistributionDraftDeps = {},
): Promise<DistributionDraft> {
  await assertAdmin(client, actorId);
  const draft = await loadDistributionDraft(input, deps);
  return enrichPreviewDraft(draft, input, client, deps);
}
