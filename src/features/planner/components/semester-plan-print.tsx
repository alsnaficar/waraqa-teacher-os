import type { CalculatedLessonEntry } from "../services/planner-engine";
import {
  buildPlanQrPayload,
  uniqueLessons,
  type SemesterPlanMeta,
} from "../services/semester-plan.service";

const DAY_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface SemesterPlanPrintProps {
  meta: SemesterPlanMeta;
  entries: CalculatedLessonEntry[];
  includeSchoolLogo: boolean;
  schoolLogoUrl?: string | null;
  includeQr: boolean;
}

/**
 * Print-only surface. Hidden on screen; `@media print` reveals `#semester-plan-print`.
 */
export function SemesterPlanPrintDocument({
  meta,
  entries,
  includeSchoolLogo,
  schoolLogoUrl,
  includeQr,
}: SemesterPlanPrintProps) {
  const rows = uniqueLessons(entries);
  const qrUrl = includeQr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(buildPlanQrPayload(meta))}`
    : null;

  return (
    <div id="semester-plan-print" className="hidden" dir="rtl">
      <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-emerald-800 pb-4">
        <div className="flex items-center gap-3">
          <img
            src="/branding/moe-logo.svg"
            alt="وزارة التعليم"
            className="h-20 w-20 object-contain"
          />
          <div>
            <p className="text-lg font-bold text-emerald-900">المملكة العربية السعودية</p>
            <p className="text-base font-semibold text-emerald-800">وزارة التعليم</p>
            <p className="text-sm">خطة توزيع المنهج — الفصل الدراسي</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          {includeSchoolLogo && schoolLogoUrl ? (
            <img
              src={schoolLogoUrl}
              alt="شعار المدرسة"
              className="h-20 w-20 rounded-md object-contain"
            />
          ) : null}
          {qrUrl ? (
            <img src={qrUrl} alt="رمز QR لخطة الفصل" className="h-20 w-20 object-contain" />
          ) : null}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Field label="الإدارة التعليمية" value={meta.educationAdministration || "—"} />
        <Field label="اسم المدرسة" value={meta.schoolName || "—"} />
        <Field label="اسم المعلم" value={meta.teacherName || "—"} />
        <Field label="المادة" value={meta.subject || "—"} />
        <Field label="الصف" value={meta.grade || "—"} />
        <Field label="الفصل الدراسي" value={meta.semesterLabel || "—"} />
        <Field label="العام الدراسي" value={meta.academicYearLabel || "—"} />
        <Field label="حالة الخطة" value={meta.statusLabel || "—"} />
        <Field label="الإصدار" value={meta.versionLabel || "—"} />
        <Field
          label="تاريخ الاعتماد"
          value={meta.approvedAt ? meta.approvedAt.slice(0, 10) : "—"}
        />
        <Field label="عدد الأسابيع الدراسية" value={String(meta.teachingWeeksCount || "—")} />
        <Field label="عدد الدروس" value={String(meta.lessonsCount || "—")} />
        <Field label="تاريخ الطباعة" value={meta.printDate || "—"} />
      </section>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-emerald-50">
            {[
              "الأسبوع",
              "التاريخ",
              "الوحدة",
              "الدرس",
              "عدد الحصص",
              "الأهداف العامة",
              "الوسائل التعليمية",
              "أساليب التقويم",
              "ملاحظات",
            ].map((heading) => (
              <th
                key={heading}
                className="border border-emerald-800 px-1.5 py-1.5 text-right font-bold"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.lessonId ?? row.id}>
              <td className="border border-emerald-800 px-1.5 py-1">
                {row.teachingWeek || row.weekNumber}
                <div>
                  {DAY_LABELS[row.dayOfWeek] ?? ""} · ح{row.period}
                </div>
              </td>
              <td className="border border-emerald-800 px-1.5 py-1">{row.suggestedDate}</td>
              <td className="border border-emerald-800 px-1.5 py-1">{row.unit || "—"}</td>
              <td className="border border-emerald-800 px-1.5 py-1">
                {row.lessonTitle.replace(/ \(جزء \d+\)$/, "")}
              </td>
              <td className="border border-emerald-800 px-1.5 py-1 text-center">
                {row.periodsCount}
              </td>
              <td className="border border-emerald-800 px-1.5 py-1">{row.objectives || "—"}</td>
              <td className="border border-emerald-800 px-1.5 py-1">
                {row.teachingResources || "—"}
              </td>
              <td className="border border-emerald-800 px-1.5 py-1">
                {row.assessmentMethods || "—"}
              </td>
              <td className="border border-emerald-800 px-1.5 py-1">{row.planNotes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-8 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="mb-10 font-semibold">توقيع المعلم</p>
          <div className="border-b border-foreground/40" />
        </div>
        <div>
          <p className="mb-10 font-semibold">اعتماد قائد المدرسة</p>
          <div className="border-b border-foreground/40" />
        </div>
      </footer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-emerald-800/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
