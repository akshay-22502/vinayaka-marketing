import { PURCHASE_STATUS_LABELS, type PurchaseStatus } from "@/lib/admin/purchases";

// The label for where a purchase is. The text carries the meaning; the colour only helps.

const STATUS_CLASSES: Record<PurchaseStatus, string> = {
  quotation: "bg-violet-100 text-violet-900",
  ordered: "bg-sky-100 text-sky-900",
  shipped: "bg-amber-100 text-amber-900",
  arrived: "bg-teal-100 text-teal-900",
  delivered: "bg-green-100 text-green-900",
  cancelled: "bg-slate-200 text-slate-800",
};

const badge = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function PurchaseStatusBadge({ status }: { status: string }) {
  const known = status in STATUS_CLASSES;
  return (
    <span className={`${badge} ${known ? STATUS_CLASSES[status as PurchaseStatus] : "bg-slate-200 text-slate-800"}`}>
      {known ? PURCHASE_STATUS_LABELS[status as PurchaseStatus] : status}
    </span>
  );
}
