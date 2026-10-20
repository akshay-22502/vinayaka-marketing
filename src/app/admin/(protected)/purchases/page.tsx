import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PurchaseTable } from "@/components/admin/PurchaseTable";
import { PURCHASE_LIST_COLUMNS, withSums, type PurchaseListRow } from "@/lib/admin/purchase-list";
import {
  PURCHASE_DESTINATIONS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  parsePurchaseFilters,
  purchasesHref,
} from "@/lib/admin/purchases";
import { clampPage, pageCount, rangeForPage } from "@/lib/admin/quote-filters";
import { requireAdmin } from "@/lib/admin/require-admin";
import { countryName } from "@/lib/format";

export const metadata: Metadata = { title: "Purchases" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pill = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold";
const pillIdle = "border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
const pillActive = "border-navy bg-navy text-white";

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="w-16 text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={`${pill} ${active ? pillActive : pillIdle}`}>
      {children}
    </Link>
  );
}

export default async function PurchasesPage({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const filters = parsePurchaseFilters(await searchParams);

  // Counted first, so a page past the end can be pulled back to the last page.
  let countQuery = supabase.from("purchases").select("id", { count: "exact", head: true });
  if (filters.destination) countQuery = countQuery.eq("destination", filters.destination);
  if (filters.status) countQuery = countQuery.eq("status", filters.status);
  if (filters.supplier) countQuery = countQuery.eq("supplier_id", filters.supplier);
  const counted = await countQuery;
  if (counted.error) throw new Error(`Could not count purchases: ${counted.error.message}`);

  const total = counted.count ?? 0;
  const page = clampPage(filters.page, total);
  const pages = pageCount(total);
  const { from, to } = rangeForPage(page);

  // Newest order first; the id breaks ties so a purchase never moves between pages.
  let listQuery = supabase
    .from("purchases")
    .select(PURCHASE_LIST_COLUMNS)
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  if (filters.destination) listQuery = listQuery.eq("destination", filters.destination);
  if (filters.status) listQuery = listQuery.eq("status", filters.status);
  if (filters.supplier) listQuery = listQuery.eq("supplier_id", filters.supplier);
  const listed = await listQuery;
  if (listed.error) throw new Error(`Could not load purchases: ${listed.error.message}`);
  const rows = await withSums(supabase, (listed.data ?? []) as unknown as PurchaseListRow[]);

  let supplierName: string | null = null;
  if (filters.supplier) {
    const supplier = await supabase.from("suppliers").select("name").eq("id", filters.supplier).maybeSingle();
    supplierName = (supplier.data as { name?: string } | null)?.name ?? "Unknown supplier";
  }

  const anyFilter = filters.destination !== null || filters.status !== null || filters.supplier !== null;

  return (
    <>
      <PageHeader
        title="Purchases"
        intro="What you bought from suppliers, with shipping and import costs and the landed cost. Only you can see this."
        action={
          <Link href={filters.supplier ? `/admin/purchases/new?supplier=${filters.supplier}` : "/admin/purchases/new"} className="btn btn-primary">
            New purchase
          </Link>
        }
      />

      <div className="mt-6 space-y-2">
        {supplierName ? (
          <p className="text-sm text-slate-700">
            Supplier: <span className="font-semibold">{supplierName}</span>{" "}
            <Link
              href={purchasesHref({ ...filters, supplier: null, page: 1 })}
              className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4"
            >
              Show all suppliers
            </Link>
          </p>
        ) : null}
        <FilterGroup label="Into">
          <FilterLink href={purchasesHref({ ...filters, destination: null, page: 1 })} active={filters.destination === null}>
            All countries
          </FilterLink>
          {PURCHASE_DESTINATIONS.map((destination) => (
            <FilterLink
              key={destination}
              href={purchasesHref({ ...filters, destination, page: 1 })}
              active={filters.destination === destination}
            >
              {countryName(destination)}
            </FilterLink>
          ))}
        </FilterGroup>
        <FilterGroup label="Status">
          <FilterLink href={purchasesHref({ ...filters, status: null, page: 1 })} active={filters.status === null}>
            All statuses
          </FilterLink>
          {PURCHASE_STATUSES.map((status) => (
            <FilterLink key={status} href={purchasesHref({ ...filters, status, page: 1 })} active={filters.status === status}>
              {PURCHASE_STATUS_LABELS[status]}
            </FilterLink>
          ))}
        </FilterGroup>
        {anyFilter ? (
          <p>
            <Link href="/admin/purchases" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
              Clear filters
            </Link>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
          {anyFilter ? "No purchases match these filters." : "There are no purchases yet. Add a supplier first, then the first purchase."}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-600">
            Showing {from + 1}–{from + rows.length} of {total} {total === 1 ? "purchase" : "purchases"}
          </p>
          <PurchaseTable rows={rows} caption="Purchases, newest order first" />
        </>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={purchasesHref({ ...filters, page: page - 1 })} rel="prev" className="btn btn-secondary">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold text-slate-700">
            Page {page} of {pages}
          </p>
          {page < pages ? (
            <Link href={purchasesHref({ ...filters, page: page + 1 })} rel="next" className="btn btn-secondary">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
