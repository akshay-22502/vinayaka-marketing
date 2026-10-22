import { formatDate } from "@/lib/format";
import type { GaDay, GaReport, GaRow } from "@/lib/admin/ga-report";

// What Admin > Analytics shows once Google answers: four headline numbers, visitors per day, and
// the top pages, countries and traffic sources. Plain server-rendered markup, no chart library.

const integer = new Intl.NumberFormat("en-IN");
const fmt = (value: number) => integer.format(value);

/** "2026-10-22" -> "22 Oct". */
function shortDate(iso: string): string {
  const full = formatDate(iso);
  const [day, month] = full.split(" ");
  return month ? `${day} ${month.slice(0, 3)}` : iso;
}

function Stat({ label, value, hint, testId }: { label: string; value: number; hint: string; testId: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <span data-testid={testId} className="mt-1 block text-3xl font-bold tabular-nums text-navy sm:text-4xl">
        {fmt(value)}
      </span>
      <span className="mt-1 block text-sm text-slate-600">{hint}</span>
    </div>
  );
}

/**
 * Visitors per day as bars. One series, so no legend: the heading names it. Each bar carries its
 * date and count as a tooltip and for screen readers, and the same numbers are in a table below.
 */
export function DailyChart({ daily }: { daily: GaDay[] }) {
  const max = Math.max(1, ...daily.map((day) => day.activeUsers));
  const first = daily[0];
  const last = daily[daily.length - 1];
  return (
    <section aria-labelledby="ga-daily" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="ga-daily" className="text-base font-semibold text-slate-900">
        Visitors per day
      </h2>
      <div className="mt-4 flex gap-2">
        <div aria-hidden="true" className="flex h-40 flex-col justify-between text-right text-xs tabular-nums text-slate-500">
          <span>{fmt(max)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <ul
            aria-label="Visitors per day"
            className="flex h-40 items-end gap-[2px] border-b border-slate-300 bg-[linear-gradient(to_bottom,var(--color-slate-100)_1px,transparent_1px)] bg-[length:100%_50%]"
          >
            {daily.map((day) => {
              const label = `${formatDate(day.date)}: ${fmt(day.activeUsers)} ${day.activeUsers === 1 ? "visitor" : "visitors"}`;
              return (
                <li key={day.date} title={label} className="group flex h-full min-w-0 flex-1 items-end">
                  <span className="sr-only">{label}</span>
                  <span
                    aria-hidden="true"
                    className="block w-full rounded-t-[4px] bg-navy group-hover:bg-orange"
                    style={{ height: day.activeUsers > 0 ? `max(2px, ${(day.activeUsers / max) * 100}%)` : 0 }}
                  />
                </li>
              );
            })}
          </ul>
          {first && last ? (
            <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{shortDate(first.date)}</span>
              <span>{shortDate(last.date)}</span>
            </div>
          ) : null}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-navy">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-600">
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 text-right font-semibold">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((day) => (
              <tr key={day.date} className="border-t border-slate-100">
                <td className="py-1 text-slate-700">{formatDate(day.date)}</td>
                <td className="py-1 text-right tabular-nums text-slate-900">{fmt(day.activeUsers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** A ranked list with the share of the top value as a thin bar under each row. */
function RankedList({ id, title, unit, rows, empty }: { id: string; title: string; unit: string; rows: GaRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={`${row.label}|${row.detail ?? ""}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  <span className="text-slate-900">{row.label}</span>
                  {row.detail ? <span className="block text-xs text-slate-600">{row.detail}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{fmt(row.value)}</span>
              </div>
              <span aria-hidden="true" className="mt-1 block h-1 rounded-full bg-slate-100">
                <span className="block h-1 rounded-full bg-navy" style={{ width: `${(row.value / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AnalyticsReport({ report }: { report: GaReport }) {
  const { totals, days } = report;
  const period = `Last ${days} days`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Visitors" value={totals.activeUsers} hint={period} testId="ga-visitors" />
        <Stat label="Visits" value={totals.sessions} hint="Sessions" testId="ga-sessions" />
        <Stat label="Page views" value={totals.pageViews} hint={period} testId="ga-page-views" />
        <Stat label="Quote requests" value={totals.quoteRequests} hint="Sent from the site" testId="ga-quote-requests" />
      </div>
      <DailyChart daily={report.daily} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RankedList id="ga-pages" title="Top pages" unit="Views" rows={report.topPages} empty="No page views in this period yet." />
        <RankedList id="ga-countries" title="Countries" unit="Visitors" rows={report.countries} empty="No visitors in this period yet." />
        <RankedList
          id="ga-sources"
          title="How visitors found the site"
          unit="Visits"
          rows={report.sources}
          empty="No visits in this period yet."
        />
      </div>
    </div>
  );
}
