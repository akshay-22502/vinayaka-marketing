import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsReport } from "@/components/admin/AnalyticsReport";
import { PageHeader } from "@/components/admin/PageHeader";
import { RANGES, getGaReport, parseRange, type GaProblem } from "@/lib/admin/ga-report";
import { requireAdmin } from "@/lib/admin/require-admin";
import { formatDateTimeIst } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pill = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold";
const pillIdle = "border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
const pillActive = "border-navy bg-navy text-white";

/** What to do about each problem, in the words of the setup steps in the README. */
function ProblemNotice({ problem }: { problem: GaProblem }) {
  const box = "mt-6 rounded-lg border p-5 text-base leading-relaxed";
  if (problem.kind === "not-configured") {
    return (
      <div role="status" className={`${box} border-slate-300 bg-slate-50 text-slate-800`}>
        <p className="font-semibold text-slate-900">Google Analytics is not connected yet.</p>
        <p className="mt-2">
          Add {problem.missing.map((name, index) => (
            <span key={name}>
              {index > 0 ? " and " : null}
              <code className="rounded bg-white px-1 text-sm">{name}</code>
            </span>
          ))}{" "}
          in Vercel (Settings &gt; Environment Variables, Production), then redeploy. The README section
          &quot;Google Analytics in the admin panel&quot; has the steps.
        </p>
      </div>
    );
  }
  const messages: Record<Exclude<GaProblem["kind"], "not-configured">, string> = {
    "bad-key":
      "Google did not accept the access key. Check that GA_SERVICE_ACCOUNT_KEY holds the whole JSON key file of the service account, then redeploy. If the key was deleted in Google Cloud, create a new one.",
    "bad-property":
      "GA_PROPERTY_ID is not right. It must be the property's number from Google Analytics > Admin > Property details (for example 512345678), not the G- Measurement ID.",
    "api-disabled":
      "The Google Analytics Data API is switched off in the Google Cloud project of the service account. Enable it in Google Cloud (APIs & Services > Library > Google Analytics Data API), wait a few minutes and reload.",
    "no-access": "",
    failed: "",
  };
  let text = messages[problem.kind];
  if (problem.kind === "no-access") {
    text = `The service account ${problem.clientEmail} cannot read this property yet. In Google Analytics, open Admin > Property access management, add that email with the Viewer role, then reload this page.`;
  }
  if (problem.kind === "failed") {
    text = `The numbers could not be loaded from Google right now (${problem.detail}). Reload the page in a minute.`;
  }
  return (
    <div role="alert" className={`${box} border-red-700 bg-red-50 text-red-900`}>
      {text}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: Props) {
  await requireAdmin();
  const days = parseRange((await searchParams).range);
  const result = await getGaReport(days);

  return (
    <>
      <PageHeader title="Analytics" intro="Website visitors from Google Analytics. Numbers can lag by a few hours." />

      <div role="group" aria-label="Period" className="mt-6 flex flex-wrap gap-2">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/analytics?range=${range}`}
            aria-current={range === days ? "true" : undefined}
            className={`${pill} ${range === days ? pillActive : pillIdle}`}
          >
            {range} days
          </Link>
        ))}
      </div>

      {"kind" in result ? (
        <ProblemNotice problem={result} />
      ) : (
        <div className="mt-6">
          <AnalyticsReport report={result} />
          <p className="mt-4 text-sm text-slate-600">
            Loaded {formatDateTimeIst(result.fetchedAt)}. For more detail, open{" "}
            <a href="https://analytics.google.com" className="font-medium text-navy underline" target="_blank" rel="noreferrer">
              Google Analytics
            </a>
            .
          </p>
        </div>
      )}
    </>
  );
}
