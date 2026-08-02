import * as XLSX from "xlsx";

export type ParsedLesson = {
  week_number: number | null;
  title: string;
  objectives: string;
  lesson_date: string;
  notes: string;
};

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.toString().trim().toLowerCase();
    if (keys.some((x) => norm.includes(x))) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

export async function parseExcel(file: File): Promise<ParsedLesson[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows
    .map((row) => {
      const weekRaw = pick(row, ["أسبوع", "week", "الأسبوع"]);
      const week = weekRaw ? parseInt(weekRaw.replace(/\D+/g, ""), 10) : NaN;
      const title =
        pick(row, ["درس", "lesson", "عنوان", "title", "موضوع"]) ||
        String(Object.values(row).find((v) => v && String(v).trim()) ?? "").trim();
      const objectives = pick(row, ["هدف", "objective", "أهداف"]);
      const date = pick(row, ["تاريخ", "date"]);
      const notes = pick(row, ["ملاحظ", "note"]);
      return {
        week_number: Number.isFinite(week) ? week : null,
        title,
        objectives,
        lesson_date: date,
        notes,
      };
    })
    .filter((l) => l.title);
}

export async function parsePdf(file: File): Promise<ParsedLesson[]> {
  const pdfjs = await import("pdfjs-dist");

  const worker = new Worker(new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url), {
    type: "module",
  });
  (
    pdfjs as unknown as { GlobalWorkerOptions: { workerPort: Worker } }
  ).GlobalWorkerOptions.workerPort = worker;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    text
      .split(/\n|(?<=\.)\s+|\s{3,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .forEach((s) => lines.push(s));
  }
  const week = 1;
  return lines.slice(0, 60).map((title, i) => ({
    week_number: Math.floor(i / 3) + week,
    title: title.slice(0, 200),
    objectives: "",
    lesson_date: "",
    notes: "",
  }));
}

export async function parseCurriculumFile(file: File): Promise<ParsedLesson[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseExcel(file);
  if (name.endsWith(".pdf")) return parsePdf(file);
  throw new Error("صيغة الملف غير مدعومة");
}
