import {
  REPORTS_HUB_PRINT_ROOT_ID,
  type ReportsHubPrintView,
} from "../services/reports-hub-print.logic";

/**
 * Print-only surface. Hidden on screen; `@media print` reveals `#reports-hub-print`.
 * Renders an already-built print view — no data fetching.
 */
export function ReportsHubPrintDocument({ view }: { view: ReportsHubPrintView | null }) {
  if (!view) return null;

  return (
    <div id={REPORTS_HUB_PRINT_ROOT_ID} className="hidden" dir="rtl">
      <header className="mb-5 border-b-2 border-emerald-800 pb-4">
        <h1 className="text-xl font-bold text-emerald-900">{view.title}</h1>
        <p className="mt-2 text-sm">
          <span className="font-semibold">الفترة: </span>
          {view.periodLabel}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">تاريخ الطباعة: </span>
          {view.printedAtLabel}
        </p>
      </header>

      <div className="space-y-5">
        {view.domains.map((domain) => (
          <section key={domain.title} className="break-inside-avoid">
            <h2 className="mb-2 text-base font-bold text-emerald-900">{domain.title}</h2>
            {domain.kind === "metrics" ? (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {domain.metrics.map((metric) => (
                    <tr key={metric.label}>
                      <td className="border border-emerald-800 px-2 py-1.5 text-right">
                        {metric.label}
                      </td>
                      <td className="border border-emerald-800 px-2 py-1.5 text-center font-semibold tabular-nums">
                        {metric.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded border border-emerald-800 px-2 py-2 text-sm">
                {domain.message}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
