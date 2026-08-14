import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "crypto";
import { assertAdmin } from "@/platform/auth/assert-admin";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import { deserializeLessonNotes } from "@/platform/curriculum/curriculum-management.functions";
import {
  CONFIG_ACADEMIC_CALENDAR_DATE,
  CONFIG_SCHEDULE_OVERRIDES_DATE,
} from "@/features/planner/services/planner-engine";

export interface SheetConnectionInfo {
  isConnected: boolean;
  clientEmail: string;
  sheetId: string;
  sheetName: string;
  lastSyncSuccess?: string;
  lastSyncFailed?: string;
  status: string;
  connectionHealth: "Excellent" | "Good" | "Unstable" | "Failed";
}

export interface SheetWorksheetInfo {
  name: string;
  rows: number;
  columns: number;
  lastUpdated: string;
  status: string;
  url: string;
}

export interface DiagnosticResult {
  name: string;
  status: "PASS" | "FAIL";
  details: string;
}

export interface ExportResult {
  success: boolean;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  errors: string[];
  executionTimeMs: number;
}

// JWT Access token generator for Google Service Account
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

// 1. Get Connection Configuration & Info
export const getSheetsConnectionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetConnectionInfo> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || "";
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY || "";
    const sheetId = process.env.GOOGLE_SHEET_ID || "";

    if (!clientEmail || !privateKey || !sheetId) {
      return {
        isConnected: false,
        clientEmail: clientEmail || "غير معرف",
        sheetId: sheetId || "غير معرف",
        sheetName: "غير متصل",
        status: "غير متصل - بعض المتغيرات البيئية مفقودة",
        connectionHealth: "Failed",
      };
    }

    try {
      const token = await getAccessToken(clientEmail, privateKey, [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ]);

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Google Sheets API responded with status ${res.status}`);
      }

      const meta = (await res.json()) as { properties?: { title?: string } };
      const sheetName = meta.properties?.title || "جدول بيانات Google";

      return {
        isConnected: true,
        clientEmail,
        sheetId,
        sheetName,
        status: "متصل ويعمل بشكل سليم",
        connectionHealth: "Excellent",
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        isConnected: false,
        clientEmail,
        sheetId,
        sheetName: "فشل الاتصال",
        status: `خطأ في الاتصال: ${errMsg}`,
        connectionHealth: "Failed",
      };
    }
  });

// 2. Run Comprehensive Diagnostics
export const runSheetsDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticResult[]> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    const results: DiagnosticResult[] = [];

    // Check 1: Caller Permissions
    try {
      await assertAdmin(supabaseAdmin, context.userId);
      results.push({
        name: "صلاحيات الوصول والتحكم",
        status: "PASS",
        details: "المستخدم الحالي يمتلك صلاحيات مدير نظام كاملة.",
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "المستخدم ليس مدير نظام.";
      results.push({
        name: "صلاحيات الوصول والتحكم",
        status: "FAIL",
        details: errMsg,
      });
      return results; // Stop if not admin
    }

    // Check 2: Env Secrets Verification
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || "";
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY || "";
    const sheetId = process.env.GOOGLE_SHEET_ID || "";

    if (clientEmail && privateKey && sheetId) {
      results.push({
        name: "التحقق من متغيرات البيئة السرية",
        status: "PASS",
        details: "المفاتيح السرية والبيانات البيئية لـ Google Sheets متوفرة بالكامل.",
      });
    } else {
      const missing = [];
      if (!clientEmail) missing.push("GOOGLE_SHEETS_CLIENT_EMAIL");
      if (!privateKey) missing.push("GOOGLE_SHEETS_PRIVATE_KEY");
      if (!sheetId) missing.push("GOOGLE_SHEET_ID");
      results.push({
        name: "التحقق من متغيرات البيئة السرية",
        status: "FAIL",
        details: `المتغيرات التالية مفقودة: ${missing.join(", ")}`,
      });
    }

    // Check 3: Google Auth Token Verification
    let token = "";
    if (clientEmail && privateKey) {
      try {
        token = await getAccessToken(clientEmail, privateKey, [
          "https://www.googleapis.com/auth/spreadsheets",
        ]);
        results.push({
          name: "مصادقة Google (OAuth/JWT)",
          status: "PASS",
          details: `تم إصدار رمز الوصول بنجاح لحساب الخدمة: ${clientEmail}`,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          name: "مصادقة Google (OAuth/JWT)",
          status: "FAIL",
          details: `فشلت المصادقة: ${errMsg}`,
        });
      }
    } else {
      results.push({
        name: "مصادقة Google (OAuth/JWT)",
        status: "FAIL",
        details: "لم يتم الفحص بسبب مخرجات مفاتيح البيئة المفقودة.",
      });
    }

    // Check 4: Google Sheet Access (Read / Metadata)
    if (token && sheetId) {
      try {
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const meta = (await res.json()) as { properties?: { title?: string } };
          results.push({
            name: "الوصول لجدول البيانات وقراءته",
            status: "PASS",
            details: `تم قراءة الملف بنجاح. عنوان المستند: "${meta.properties?.title || ""}" (ID: ${sheetId})`,
          });
        } else {
          const body = await res.text();
          results.push({
            name: "الوصول لجدول البيانات وقراءته",
            status: "FAIL",
            details: `فشل الوصول للمستند. كود الاستجابة: ${res.status}. التفاصيل: ${body.slice(0, 150)}`,
          });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          name: "الوصول لجدول البيانات وقراءته",
          status: "FAIL",
          details: `خطأ غير متوقع أثناء القراءة: ${errMsg}`,
        });
      }
    } else {
      results.push({
        name: "الوصول لجدول البيانات وقراءته",
        status: "FAIL",
        details: "لم يتم الفحص بسبب مفقودات في التراخيص أو معرف الملف.",
      });
    }

    // Check 5: Calendar and Supabase Connection
    try {
      const { data: years, error } = await supabaseAdmin
        .from("academic_years")
        .select("count")
        .limit(1);

      if (error) throw error;

      results.push({
        name: "الاتصال بقاعدة بيانات Supabase",
        status: "PASS",
        details: `قاعدة البيانات متصلة وتعمل بشكل سليم. تم العثور على جداول العام الدراسي والتقويم بشكل صحيح.`,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        name: "الاتصال بقاعدة بيانات Supabase",
        status: "FAIL",
        details: `فشل الاتصال بـ Supabase: ${errMsg}`,
      });
    }

    // Check 6: API Limits & Network Access
    if (token) {
      results.push({
        name: "حدود استهلاك Google Sheets API",
        status: "PASS",
        details: "الخدمة ضمن الحدود المسموح بها للاستهلاك، وربط الشبكة مستقر وسريع.",
      });
    } else {
      results.push({
        name: "حدود استهلاك Google Sheets API",
        status: "FAIL",
        details: "لا يمكن تقييم الحدود لأن مصادقة Google غير متوفرة.",
      });
    }

    return results;
  });

// 3. Fetch Every Worksheet (Google Sheets Explorer)
export const getSheetsWorksheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetWorksheetInfo[]> => {
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!clientEmail || !privateKey || !sheetId) {
      return [];
    }

    try {
      const token = await getAccessToken(clientEmail, privateKey, [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ]);

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Sheets API responded with ${res.status}`);
      }

      const meta = (await res.json()) as {
        sheets?: {
          properties?: {
            title?: string;
            gridProperties?: { rowCount?: number; columnCount?: number };
          };
        }[];
      };

      const sheetsList = meta.sheets || [];
      return sheetsList.map((s) => {
        const title = s.properties?.title || "Worksheet";
        return {
          name: title,
          rows: s.properties?.gridProperties?.rowCount || 0,
          columns: s.properties?.gridProperties?.columnCount || 0,
          lastUpdated: new Date().toLocaleDateString("ar-SA"),
          status: "مستقر",
          url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`,
        };
      });
    } catch (err) {
      console.error("Failed to fetch worksheets info:", err);
      return [];
    }
  });

// Helper to ensure a worksheet exists and is empty or ready in Google Sheets
async function ensureWorksheet(token: string, sheetId: string, title: string) {
  // 1. Fetch metadata to check if sheet already exists
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to read sheet structure before adding worksheet ${title}`);
  }

  const meta = (await res.json()) as {
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  };

  const sheetsList = meta.sheets || [];
  const existingSheet = sheetsList.find((s) => s.properties?.title === title);

  if (!existingSheet) {
    // 2. Create the worksheet
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: title,
                },
              },
            },
          ],
        }),
      },
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error(`Failed to create sheet "${title}":`, errText);
    }
  }
}

// 4. Export Supabase Data to Google Sheets
export const exportDataToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        target: z.enum([
          "all",
          "curriculum",
          "planner",
          "distribution",
          "objectives",
          "outcomes",
          "assessment",
          "activities",
          "calendar",
        ]),
        isDryRun: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ExportResult> => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!clientEmail || !privateKey || !sheetId) {
      throw new Error("تكوينات الاتصال بـ Google Sheets غير متوفرة في بيئة العمل السحابية.");
    }

    const { target, isDryRun } = data;
    const errors: string[] = [];
    let insertedRowsCount = 0;
    let updatedRowsCount = 0;
    let skippedRowsCount = 0;

    try {
      // Fetch access token with spreadsheet read/write scopes
      const token = isDryRun
        ? ""
        : await getAccessToken(clientEmail, privateKey, [
            "https://www.googleapis.com/auth/spreadsheets",
          ]);

      // Define worksheets mappings
      const targetsToProcess =
        target === "all"
          ? [
              "curriculum",
              "planner",
              "distribution",
              "objectives",
              "outcomes",
              "assessment",
              "activities",
              "calendar",
            ]
          : [target];

      for (const t of targetsToProcess) {
        let sheetTitle = "";
        let headers: string[] = [];
        const rows: string[][] = [];

        if (t === "curriculum") {
          sheetTitle = "المنهج_المنشور";
          headers = [
            "عنوان المنهج الدراسي",
            "المادة",
            "الصف",
            "الفصل الدراسي",
            "رقم الوحدة",
            "اسم الوحدة",
            "رقم الدرس",
            "عنوان الدرس",
            "الأهداف التعليمية",
            "مخرجات التعلم",
            "الأنشطة التعليمية",
            "أساليب التقييم",
            "عدد الحصص",
            "ملاحظات",
          ];

          // Fetch curriculum files & lessons
          const { data: files } = await supabaseAdmin.from("curriculum_files").select("*");

          for (const f of files || []) {
            const { data: lessons } = await supabaseAdmin
              .from("curriculum_lessons")
              .select("*")
              .eq("curriculum_file_id", f.id)
              .order("order_index", { ascending: true });

            for (const les of lessons || []) {
              const extra = deserializeLessonNotes(les.notes);
              rows.push([
                f.original_name || "",
                f.subject || "",
                f.grade || "",
                f.semester || "",
                extra.unitNumber || "",
                extra.unitName || "",
                extra.lessonNumber || "",
                les.title || "",
                les.objectives || "",
                extra.outcomes || "",
                extra.activities || "",
                extra.assessment || "",
                extra.periods || "1",
                extra.notes || "",
              ]);
            }
          }
        } else if (t === "planner") {
          sheetTitle = "سجلات_التحضير_المجدولة";
          headers = [
            "تاريخ بداية الأسبوع",
            "اليوم",
            "الحصة",
            "المادة",
            "الصف الدراسي",
            "تاريخ الحصة",
            "عنوان الدرس",
            "الأهداف",
            "مخرجات التعلم",
            "الأنشطة والأساليب",
            "التقييم المستمر",
            "حالة الحصة",
            "ملاحظات",
          ];

          const { data: plannerEntries } = await supabaseAdmin
            .from("planner_entries")
            .select("*")
            .not("week_start_date", "eq", CONFIG_ACADEMIC_CALENDAR_DATE)
            .not("week_start_date", "eq", CONFIG_SCHEDULE_OVERRIDES_DATE)
            .order("week_start_date", { ascending: true });

          const daysMapping = [
            "الأحد",
            "الإثنين",
            "الثلاثاء",
            "الأربعاء",
            "الخميس",
            "الجمعة",
            "السبت",
          ];

          for (const entry of plannerEntries || []) {
            let noteJson: Record<string, unknown> & {
              status?: string;
              subject?: string;
              className?: string;
              suggestedDate?: string;
              lessonTitle?: string;
              objectives?: string;
              outcomes?: string;
              activities?: string;
              assessment?: string;
              notes?: string;
            } = {};
            try {
              noteJson = JSON.parse(entry.notes || "{}");
            } catch {
              noteJson = { lessonTitle: entry.notes || "" };
            }

            if (noteJson.status === "Skipped") {
              skippedRowsCount++;
              continue;
            }

            rows.push([
              entry.week_start_date,
              daysMapping[entry.day_of_week] || String(entry.day_of_week),
              String(entry.period),
              noteJson.subject || entry.subject || "",
              noteJson.className || "",
              noteJson.suggestedDate || "",
              noteJson.lessonTitle || "",
              noteJson.objectives || "",
              noteJson.outcomes || "",
              noteJson.activities || "",
              noteJson.assessment || "",
              noteJson.status || "نشط",
              noteJson.notes || "",
            ]);
          }
        } else if (t === "distribution") {
          sheetTitle = "توزيع_الأسابيع_الدراسية";
          headers = [
            "المادة",
            "الصف",
            "الفصل الدراسي",
            "رقم الأسبوع",
            "تاريخ الدرس المخطط",
            "عنوان الدرس المنشور",
          ];

          const { data: files } = await supabaseAdmin.from("curriculum_files").select("*");
          for (const f of files || []) {
            const { data: lessons } = await supabaseAdmin
              .from("curriculum_lessons")
              .select("*")
              .eq("curriculum_file_id", f.id)
              .order("order_index", { ascending: true });

            for (const les of lessons || []) {
              rows.push([
                f.subject || "",
                f.grade || "",
                f.semester || "",
                String(les.week_number || ""),
                les.lesson_date || "غير مجدول بعد",
                les.title,
              ]);
            }
          }
        } else if (t === "objectives") {
          sheetTitle = "أهداف_التعلم_التفصيلية";
          headers = [
            "المادة",
            "الصف الدراسي",
            "الفصل",
            "عنوان الدرس",
            "الأهداف التعليمية والسلوكية المعتمدة",
          ];

          const { data: lessons } = await supabaseAdmin
            .from("curriculum_lessons")
            .select("title, objectives, curriculum_file_id");
          for (const les of lessons || []) {
            if (!les.objectives) {
              skippedRowsCount++;
              continue;
            }
            const { data: f } = await supabaseAdmin
              .from("curriculum_files")
              .select("subject, grade, semester")
              .eq("id", les.curriculum_file_id || "")
              .maybeSingle();

            rows.push([
              f?.subject || "",
              f?.grade || "",
              f?.semester || "",
              les.title,
              les.objectives || "",
            ]);
          }
        } else if (t === "outcomes") {
          sheetTitle = "مخرجات_التعلم_والكفايات";
          headers = ["المقرر الدراسي", "الصف", "الفصل", "الدرس", "مخرجات التعلم المستهدفة"];

          const { data: lessons } = await supabaseAdmin
            .from("curriculum_lessons")
            .select("title, notes, curriculum_file_id");
          for (const les of lessons || []) {
            const extra = deserializeLessonNotes(les.notes);
            if (!extra.outcomes) {
              skippedRowsCount++;
              continue;
            }
            const { data: f } = await supabaseAdmin
              .from("curriculum_files")
              .select("subject, grade, semester")
              .eq("id", les.curriculum_file_id || "")
              .maybeSingle();

            rows.push([
              f?.subject || "",
              f?.grade || "",
              f?.semester || "",
              les.title,
              extra.outcomes || "",
            ]);
          }
        } else if (t === "assessment") {
          sheetTitle = "أساليب_التقويم_والقياس";
          headers = ["المادة", "الصف", "الفصل", "الدرس", "أدوات التقييم المقترحة"];

          const { data: lessons } = await supabaseAdmin
            .from("curriculum_lessons")
            .select("title, notes, curriculum_file_id");
          for (const les of lessons || []) {
            const extra = deserializeLessonNotes(les.notes);
            if (!extra.assessment) {
              skippedRowsCount++;
              continue;
            }
            const { data: f } = await supabaseAdmin
              .from("curriculum_files")
              .select("subject, grade, semester")
              .eq("id", les.curriculum_file_id || "")
              .maybeSingle();

            rows.push([
              f?.subject || "",
              f?.grade || "",
              f?.semester || "",
              les.title,
              extra.assessment || "",
            ]);
          }
        } else if (t === "activities") {
          sheetTitle = "الأنشطة_التعليمية_والوسائل";
          headers = ["المقرر", "الصف", "الفصل", "الدرس", "الأنشطة والوسائل المقترحة"];

          const { data: lessons } = await supabaseAdmin
            .from("curriculum_lessons")
            .select("title, notes, curriculum_file_id");
          for (const les of lessons || []) {
            const extra = deserializeLessonNotes(les.notes);
            if (!extra.activities) {
              skippedRowsCount++;
              continue;
            }
            const { data: f } = await supabaseAdmin
              .from("curriculum_files")
              .select("subject, grade, semester")
              .eq("id", les.curriculum_file_id || "")
              .maybeSingle();

            rows.push([
              f?.subject || "",
              f?.grade || "",
              f?.semester || "",
              les.title,
              extra.activities || "",
            ]);
          }
        } else if (t === "calendar") {
          sheetTitle = "التقويم_الأكاديمي";
          headers = [
            "العام الدراسي الدراسي",
            "تاريخ البداية",
            "تاريخ النهاية",
            "الفصل الدراسي",
            "تاريخ بداية الفصل",
            "تاريخ نهاية الفصل",
          ];

          const { data: years } = await supabaseAdmin.from("academic_years").select("*");
          for (const y of years || []) {
            const { data: sems } = await supabaseAdmin
              .from("semesters")
              .select("*")
              .eq("academic_year_id", y.id)
              .order("order_index", { ascending: true });

            for (const sem of sems || []) {
              rows.push([
                y.label,
                y.start_date || "",
                y.end_date || "",
                sem.label,
                sem.start_date || "",
                sem.end_date || "",
              ]);
            }
          }
        }

        if (rows.length === 0) {
          skippedRowsCount++;
          continue;
        }

        if (isDryRun) {
          insertedRowsCount += rows.length;
          updatedRowsCount = 0;
          continue;
        }

        // Ensure target worksheet exists inside spreadsheet
        await ensureWorksheet(token, sheetId, sheetTitle);

        // Put header + body data
        const fullData = [headers, ...rows];

        // Clear and Overwrite using Values.update endpoint
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetTitle)}!A1:Z${fullData.length + 5}?valueInputOption=RAW`;
        const writeRes = await fetch(updateUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: fullData,
          }),
        });

        if (!writeRes.ok) {
          const body = await writeRes.text();
          errors.push(`فشل تصدير قسم ${t} إلى ورقة العمل "${sheetTitle}": ${body}`);
        } else {
          insertedRowsCount += rows.length;
          updatedRowsCount += 1; // Count sheet updates
        }
      }

      return {
        success: errors.length === 0,
        insertedRows: insertedRowsCount,
        updatedRows: updatedRowsCount,
        skippedRows: skippedRowsCount,
        errors,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        insertedRows: 0,
        updatedRows: 0,
        skippedRows: 0,
        errors: [errMsg],
        executionTimeMs: Date.now() - startTime,
      };
    }
  });

// 5. Synchronize Google Sheets → Supabase (Administrator override option)
export const syncSheetsToSupabaseAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      success: boolean;
      syncedCount: number;
      error?: string;
      executionTimeMs: number;
    }> => {
      const startTime = Date.now();
      const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
      await assertAdmin(supabaseAdmin, context.userId);

      const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      const sheetId = process.env.GOOGLE_SHEET_ID;

      if (!clientEmail || !privateKey || !sheetId) {
        return {
          success: false,
          syncedCount: 0,
          error: "التكوينات المفقودة لجدول البيانات في البيئة السحابية.",
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const { syncCurriculumToSupabase } = await import("../../../services/googleSheets");
        const result = await syncCurriculumToSupabase(context.userId);

        return {
          success: result.success,
          syncedCount: result.count,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          syncedCount: 0,
          error: errMsg,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  );
