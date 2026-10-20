import Link from "next/link";
import type { PurchaseListEntry } from "@/lib/admin/purchase-list";
import { formatMoney, formatQuantity, localCurrency } from "@/lib/admin/purchases";
import { countryName, formatDate } from "@/lib/format";
import { PurchaseStatusBadge } from "./PurchaseStatusBadge";

const cell = "px-3 py-3 align-top text-sm text-slate-700";
const headCell = "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700";

/** A table of purchases: date, supplier and order number, quantity, landed cost and status. */
export function PurchaseTable({ rows, caption }: { rows: PurchaseListEntry[]; caption: string }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-0 border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-100">
          <tr>
            <th scope="col" className={headCell}>
              Purchase
            </th>
            <th scope="col" className={`${headCell} hidden sm:table-cell`}>
              Quantity
            </th>
            <th scope="col" className={`${headCell} hidden sm:table-cell text-right`}>
              Landed cost
            </th>
            <th scope="col" className={headCell}>
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row) => {
            const local = localCurrency(row.destination);
            const title = row.suppliers?.name ?? "Supplier";
            return (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={`${cell} min-w-0 [overflow-wrap:anywhere]`}>
                  <Link href={`/admin/purchases/${row.id}`} className="font-semibold text-navy underline underline-offset-4 hover:text-navy/80">
                    {row.reference ? `${title} · ${row.reference}` : title}
                  </Link>
                  <span className="mt-1 block text-xs text-slate-600">
                    {[row.order_date ? formatDate(row.order_date) : "No order date", `to ${countryName(row.destination)}`].join(", ")}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600 sm:hidden">
                    {formatQuantity(row.area)} m² · {formatMoney(row.landed, local)}
                  </span>
                </td>
                <td className={`${cell} hidden whitespace-nowrap tabular-nums sm:table-cell`}>
                  {formatQuantity(row.rolls, 0)} rolls
                  <span className="block text-xs text-slate-600">{formatQuantity(row.area)} m²</span>
                </td>
                <td className={`${cell} hidden whitespace-nowrap text-right tabular-nums sm:table-cell`}>
                  {formatMoney(row.landed, local)}
                  {row.landedPerSqm !== null ? (
                    <span className="block text-xs text-slate-600">{formatMoney(row.landedPerSqm, local)} / m²</span>
                  ) : null}
                </td>
                <td className={cell}>
                  <PurchaseStatusBadge status={row.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
