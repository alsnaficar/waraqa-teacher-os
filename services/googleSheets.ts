import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/platform/database/supabase/types";

export interface CurriculumRecord {
  stage: "primary" | "intermediate" | "secondary";
  grade: string;
  subject: string;
  semester: string;
  unitTitle: string;
  lessonTitle: string;
  lessonDate?: string;
  objectives?: string;
  notes?: string;
}

// Native RS256 JWT assertion generation for Google Service Account authentication
async function getAccessToken(
  clientEmail: string,
  privateKeyStr: string,
  scopes: string[],
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

  const res = await fetch("https://oauth2.googleapis.com/token", {
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

// 1. Read Spreadsheet, Validate and parse columns, return structured curriculum
export async function getCurriculumFromSheet(
  sheetId?: string,
  range = "Sheet1!A1:Z2000",
): Promise<CurriculumRecord[]> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const activeSheetId = sheetId || process.env.GOOGLE_SHEET_ID;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Sheets authentication configuration (GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY)",
    );
  }
  if (!activeSheetId) {
    throw new Error("Missing Google Sheet ID (GOOGLE_SHEET_ID)");
  }

  const token = await getAccessToken(clientEmail, privateKey, [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ]);

  // Fetch sheet metadata to see the title of the first sheet if Sheet1 is not found
  let finalRange = range;
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeSheetId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        sheets?: { properties?: { title?: string } }[];
      };
      const firstSheetTitle = meta.sheets?.[0]?.properties?.title;
      if (firstSheetTitle && range.startsWith("Sheet1!")) {
        finalRange = `${firstSheetTitle}!${range.split("!")[1]}`;
      }
    }
  } catch (e) {
    console.warn("Could not fetch spreadsheet metadata, using fallback range:", range, e);
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${activeSheetId}/values/${encodeURIComponent(finalRange)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch Google Sheets data: ${errText}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values || [];
  if (rows.length < 2) {
    return [];
  }

  // Parse headers & convert to lowercase for case-insensitive lookup
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const curriculumList: CurriculumRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || !row[0]) continue;

    // Direct and localized mapping helper
    const getVal = (colNames: string[]): string => {
      const idx = headers.findIndex((h) => colNames.some((name) => h === name || h.includes(name)));
      return idx !== -1 && row[idx] ? row[idx].trim() : "";
    };

    const stageRaw = getVal(["stage", "المرحلة", "القسم"]).toLowerCase();
    let stage: "primary" | "intermediate" | "secondary" = "intermediate";
    if (
      stageRaw.includes("primary") ||
      stageRaw.includes("ابتدائي") ||
      stageRaw.includes("الأولى")
    ) {
      stage = "primary";
    } else if (
      stageRaw.includes("secondary") ||
      stageRaw.includes("ثانوي") ||
      stageRaw.includes("عالي")
    ) {
      stage = "secondary";
    }

    const record: CurriculumRecord = {
      stage,
      grade: getVal(["grade", "الصف", "السنة"]),
      subject: getVal(["subject", "المادة", "المقرر"]),
      semester: getVal(["semester", "الفصل", "الترم", "الفصل الدراسي"]),
      unitTitle: getVal(["unit", "الوحدة", "الموضوع"]),
      lessonTitle: getVal(["lesson", "الدرس", "عنوان الدرس"]),
      lessonDate: getVal(["date", "التاريخ"]),
      objectives: getVal(["objectives", "الأهداف", "اهداف"]),
      notes: getVal(["notes", "ملاحظات", "ملخص"]),
    };

    if (record.lessonTitle && record.subject && record.grade) {
      curriculumList.push(record);
    }
  }

  return curriculumList;
}

// 2. Synchronize Curriculum into Supabase (System of Record)
export async function syncCurriculumToSupabase(
  userId: string,
): Promise<{ success: boolean; count: number }> {
  const records = await getCurriculumFromSheet();
  if (records.length === 0) {
    return { success: true, count: 0 };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase configuration (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) for server-side synchronization.",
    );
  }

  // Initialize service-role admin client to bypass RLS policies
  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

  // Group lessons by unique file attributes: subject, grade, semester
  const groups = new Map<
    string,
    { subject: string; grade: string; semester: string; lessons: CurriculumRecord[] }
  >();

  for (const rec of records) {
    const key = `${rec.subject}-${rec.grade}-${rec.semester}`;
    if (!groups.has(key)) {
      groups.set(key, {
        subject: rec.subject,
        grade: rec.grade,
        semester: rec.semester,
        lessons: [],
      });
    }
    groups.get(key)!.lessons.push(rec);
  }

  let totalSynced = 0;

  for (const group of groups.values()) {
    // 1. Check if curriculum file exists or create it
    const { data: existingFiles, error: fileQueryErr } = await adminClient
      .from("curriculum_files")
      .select("id")
      .eq("subject", group.subject)
      .eq("grade", group.grade)
      .eq("semester", group.semester)
      .eq("user_id", userId);

    if (fileQueryErr) {
      console.error("Error querying existing curriculum files:", fileQueryErr);
      continue;
    }

    let fileId: string;

    if (existingFiles && existingFiles.length > 0) {
      fileId = existingFiles[0].id;
    } else {
      const { data: newFile, error: fileInsertErr } = await adminClient
        .from("curriculum_files")
        .insert({
          original_name: `Google Sheets: ${group.subject} - ${group.grade}`,
          subject: group.subject,
          grade: group.grade,
          semester: group.semester,
          mime_type: "application/vnd.google-apps.spreadsheet",
          status: "completed",
          storage_path: "google-sheet",
          size_bytes: 0,
          user_id: userId,
        })
        .select("id")
        .single();

      if (fileInsertErr || !newFile) {
        console.error("Error creating curriculum file:", fileInsertErr);
        continue;
      }
      fileId = newFile.id;
    }

    // 2. Clear old lessons for this fileId
    const { error: deleteErr } = await adminClient
      .from("curriculum_lessons")
      .delete()
      .eq("curriculum_file_id", fileId);

    if (deleteErr) {
      console.error("Error clearing old lessons:", deleteErr);
      continue;
    }

    // 3. Bulk insert the new lessons
    const lessonsToInsert = group.lessons.map((les, index) => ({
      curriculum_file_id: fileId,
      title: les.lessonTitle,
      objectives: les.objectives || les.unitTitle || null,
      notes: les.notes || null,
      order_index: index,
      lesson_date: les.lessonDate || null,
      user_id: userId,
      week_number: index + 1,
    }));

    const { error: insertErr } = await adminClient
      .from("curriculum_lessons")
      .insert(lessonsToInsert);

    if (insertErr) {
      console.error("Error inserting lessons into Supabase:", insertErr);
    } else {
      totalSynced += lessonsToInsert.length;
    }
  }

  return { success: true, count: totalSynced };
}
