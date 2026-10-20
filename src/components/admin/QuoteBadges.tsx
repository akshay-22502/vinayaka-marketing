import { QUOTE_STATUS_LABELS } from "@/lib/admin/quote-view";
import type { QuoteStatus } from "@/lib/admin/quote-filters";

// The little labels on a quote request. The text carries the meaning; the colour only helps.

const STATUS_CLASSES: Record<QuoteStatus, string> = {
  new: "bg-sky-100 text-sky-900",
  contacted: "bg-amber-100 text-amber-900",
  quoted: "bg-green-100 text-green-900",
  closed: "bg-slate-200 text-slate-800",
};

const badge = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function QuoteStatusBadge({ status }: { status: string }) {
  const known = status in STATUS_CLASSES;
  return (
    <span className={`${badge} ${known ? STATUS_CLASSES[status as QuoteStatus] : "bg-slate-200 text-slate-800"}`}>
      {known ? QUOTE_STATUS_LABELS[status as QuoteStatus] : status}
    </span>
  );
}

/** Shown when no email went to the team for this request (no recipient for its country, or the email failed). */
export function EmailNotSentBadge() {
  return <span className={`${badge} bg-red-100 text-red-900`}>Email not sent</span>;
}
