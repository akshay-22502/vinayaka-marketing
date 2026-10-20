import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { containsPattern } from "@/lib/admin/buyers";
import { clampPage, pageCount, rangeForPage } from "@/lib/admin/quote-filters";
import { requireAdmin } from "@/lib/admin/require-admin";
import { parseSupplierFilters, suppliersHref } from "@/lib/admin/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type SupplierListRow = { id: string; name: string; country: string; location: string; makes: string };

// Same look as the admin form fields (Field.tsx is a client module, so its class is not imported here).
const searchInput =
  "mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm";
const cell = "px-3 py-3 align-top text-sm text-slate-700";
const headCell = "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700";

export default async function SuppliersPage({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const filters = parseSupplierFilters(await searchParams);

  // Counted first, so a page past the end can be pulled back to the last page.
  let countQuery = supabase.from("suppliers").select("id", { count: "exact", head: true });
  if (filters.q) countQuery = countQuery.ilike("name", containsPattern(filters.q));
  const counted = await countQuery;
  if (counted.error) throw new Error(`Could not count suppliers: ${counted.error.message}`);

  const total = counted.count ?? 0;
  const page = clampPage(filters.page, total);
  const pages = pageCount(total);
  const { from, to } = rangeForPage(page);

  // By name; the id breaks ties so a supplier never moves between pages.
  let listQuery = supabase.from("suppliers").select("id, name, country, location, makes").order("name").order("id").range(from, to);
  if (filters.q) listQuery = listQuery.ilike("name", containsPattern(filters.q));
  const listed = await listQuery;
  if (listed.error) throw new Error(`Could not load suppliers: ${listed.error.message}`);
  const rows = (listed.data ?? []) as SupplierListRow[];

  // How many purchases each listed supplier has. A failed lookup only leaves the column empty.
  const purchaseCount = new Map<string, number>();
  if (rows.length > 0) {
    const purchases = await supabase
      .from("purchases")
      .select("supplier_id")
      .in(
        "supplier_id",
        rows.map((row) => row.id),
      );
    if (purchases.error) console.error("Could not count purchases per supplier", purchases.error);
    for (const purchase of purchases.data ?? []) {
      const id = purchase.supplier_id as string;
      purchaseCount.set(id, (purchaseCount.get(id) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        intro="The manufacturers you buy from. Only you can see this list."
        action={
          <Link href="/admin/suppliers/new" className="btn btn-primary">
            New supplier
          </Link>
        }
      />

      <form action="/admin/suppliers" method="get" role="search" className="mt-6 flex max-w-xl flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="supplier-search" className="text-sm font-semibold text-slate-800">
            Search by name
          </label>
          <input id="supplier-search" name="q" type="search" defaultValue={filters.q} maxLength={100} className={searchInput} />
        </div>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>
      {filters.q ? (
        <p className="mt-2">
          <Link href="/admin/suppliers" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
            Clear search
          </Link>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
          {filters.q ? "No suppliers match this search." : "There are no suppliers yet. Add the first one."}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-600">
            Showing {from + 1}–{from + rows.length} of {total} {total === 1 ? "supplier" : "suppliers"}
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-0 border-collapse text-left">
              <caption className="sr-only">Suppliers, by name</caption>
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className={headCell}>
                    Supplier
                  </th>
                  <th scope="col" className={`${headCell} hidden md:table-cell`}>
                    What they make
                  </th>
                  <th scope="col" className={`${headCell} text-right`}>
                    Purchases
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className={`${cell} min-w-0 [overflow-wrap:anywhere]`}>
                      <Link href={`/admin/suppliers/${row.id}`} className="font-semibold text-navy underline underline-offset-4 hover:text-navy/80">
                        {row.name}
                      </Link>
                      <span className="mt-1 block text-xs text-slate-600">{[row.location, row.country].filter(Boolean).join(", ")}</span>
                    </td>
                    <td className={`${cell} hidden min-w-0 [overflow-wrap:anywhere] md:table-cell`}>{row.makes || "–"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{purchaseCount.get(row.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={suppliersHref({ ...filters, page: page - 1 })} rel="prev" className="btn btn-secondary">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold text-slate-700">
            Page {page} of {pages}
          </p>
          {page < pages ? (
            <Link href={suppliersHref({ ...filters, page: page + 1 })} rel="next" className="btn btn-secondary">
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
