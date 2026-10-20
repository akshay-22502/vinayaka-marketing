import { BUYER_STATUS_LABELS, type BuyerStatus } from "@/lib/admin/buyers";

// The label for where a wholesale buyer is. The text carries the meaning; the colour only helps.

const STATUS_CLASSES: Record<BuyerStatus, string> = {
  not_contacted: "bg-slate-200 text-slate-800",
  contacted: "bg-sky-100 text-sky-900",
  in_discussion: "bg-amber-100 text-amber-900",
  quoted: "bg-violet-100 text-violet-900",
  onboarded: "bg-green-100 text-green-900",
  not_interested: "bg-red-100 text-red-900",
};

const badge = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function BuyerStatusBadge({ status }: { status: string }) {
  const known = status in STATUS_CLASSES;
  return (
    <span className={`${badge} ${known ? STATUS_CLASSES[status as BuyerStatus] : "bg-slate-200 text-slate-800"}`}>
      {known ? BUYER_STATUS_LABELS[status as BuyerStatus] : status}
    </span>
  );
}
