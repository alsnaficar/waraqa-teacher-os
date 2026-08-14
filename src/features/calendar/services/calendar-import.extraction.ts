/**
 * Gemini vision/PDF extraction for official calendar files.
 * Returns structured raw items only. Never writes to the database.
 */

import {
  CALENDAR_IMPORT_TIMEOUT_MS,
  CALENDAR_IMPORT_TIMEOUT_MESSAGE,
  isCalendarImportTimeoutError,
  type CalendarImportMime,
} from "./calendar-import.limits.ts";
import type { RawCalendarImportItem } from "./calendar-import.logic.ts";

export type CalendarImportGeminiLike = {
  models: {
    generateContent: (input: {
      model: string;
      contents: unknown;
      config?: unknown;
    }) => Promise<{ text?: string | null }>;
  };
};

export const CALENDAR_IMPORT_EXTRACTION_PROMPT = `You extract official Saudi academic-calendar holidays and exceptions from a PDF or image.

Return JSON only, matching the schema. Do not invent dates. Do not convert Hijri to Gregorian.
If a date is printed in Gregorian, use YYYY-MM-DD.
If a date is Hijri only, leave startDate and endDate empty and copy the printed Hijri text into hijriStart/hijriEnd.
If a range is printed, fill both startDate and endDate. If a single day, set both to that day.
kind must be one of: holiday, exam, remote, break, teaching_day, non_teaching_day.
confidence is 0 to 1.
Never guess the academic year, semester, or region.`;

export function parseCalendarImportAiResponse(text: string): RawCalendarImportItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new Error("تعذر قراءة نتيجة استخراج التقويم.");
  }
  if (Array.isArray(parsed)) return parsed as RawCalendarImportItem[];
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { items?: unknown }).items)
  ) {
    return (parsed as { items: RawCalendarImportItem[] }).items;
  }
  return [];
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function extractCalendarExceptionsFromFile(
  input: { bytes: Uint8Array; mime: CalendarImportMime },
  ai: CalendarImportGeminiLike,
): Promise<RawCalendarImportItem[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: bytesToBase64(input.bytes),
            mimeType: input.mime,
          },
        },
        CALENDAR_IMPORT_EXTRACTION_PROMPT,
      ],
      config: {
        httpOptions: {
          timeout: CALENDAR_IMPORT_TIMEOUT_MS,
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  kind: { type: "STRING" },
                  title: { type: "STRING" },
                  startDate: { type: "STRING" },
                  endDate: { type: "STRING" },
                  hijriStart: { type: "STRING" },
                  hijriEnd: { type: "STRING" },
                  confidence: { type: "NUMBER" },
                  notes: { type: "STRING" },
                },
              },
            },
          },
          required: ["items"],
        },
      },
    });
    return parseCalendarImportAiResponse(response.text?.trim() ?? "{}");
  } catch (err: unknown) {
    if (isCalendarImportTimeoutError(err)) {
      throw new Error(CALENDAR_IMPORT_TIMEOUT_MESSAGE);
    }
    if (err instanceof Error && err.message.includes("تعذر قراءة نتيجة")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[calendar-import] extraction failed:", message);
    throw new Error("تعذر استخراج الإجازات من الملف. حاول مرة أخرى.");
  }
}
