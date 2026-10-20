import type { Metadata } from "next";
import Link from "next/link";
import { BuyerStatusBadge } from "@/components/admin/BuyerStatusBadge";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  BUYER_COUNTRIES,
  BUYER_PRIORITY_LABELS,
  BUYER_STATUSES,
  BUYER_STATUS_LABELS,
  buyersHref,
  containsPattern,
  parseBuyerFilters,
  type BuyerPriority,
} from "@/lib/admin/buyers";
import { clampPage, pageCount, rangeForPage } from "@/lib/admin/quote-filters";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { Country } from "@/lib/content/types";
import { countryName, formatDateIst } from "@/lib/format";

export const metadata: Metadata = { title: "Wholesale buyers" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type BuyerListRow = {
  id: string;
  company: string;
  country: Country;
  buyer_type: string;
  location: string;
  priority: BuyerPriority | null;
  status: string;
};

const LIST_COLUMNS = "id, company, country, buyer_type, location, priority, status";

// Same look as the admin form fields (Field.tsx is a client module, so its class is not imported here).
const searchInput =
  "mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm";
const cell = "px-3 py-3 align-top text-sm text-slate-700";
const headCell = "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700";
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

export default async function BuyersPage({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const filters = parseBuyerFilters(await searchParams);

  // Counted first, so a page past the end can be pulled back to the last page.
  let countQuery = supabase.from("wholesale_buyers").select("id", { count: "exact", head: true });
  if (filters.country) countQuery = countQuery.eq("country", filters.country);
  if (filters.status) countQuery = countQuery.eq("status", filters.status);
  if (filters.q) countQuery = countQuery.ilike("company", containsPattern(filters.q));
  const counted = await countQuery;
  if (counted.error) throw new Error(`Could not count buyers: ${counted.error.message}`);

  const total = counted.count ?? 0;
  const page = clampPage(filters.page, total);
  const pages = pageCount(total);
  const { from, to } = rangeForPage(page);

  // By company name; the id breaks ties so a buyer never moves between pages.
  let listQuery = supabase.from("wholesale_buyers").select(LIST_COLUMNS).order("company").order("id").range(from, to);
  if (filters.country) listQuery = listQuery.eq("country", filters.country);
  if (filters.status) listQuery = listQuery.eq("status", filters.status);
  if (filters.q) listQuery = listQuery.ilike("company", containsPattern(filters.q));
  const listed = await listQuery;
  if (listed.error) throw new Error(`Could not load buyers: ${listed.error.message}`);
  const rows = (listed.data ?? []) as BuyerListRow[];

  // The date of each listed buyer's latest note. A failed lookup only leaves the column empty.
  const lastNote = new Map<string, string>();
  if (rows.length > 0) {
    const notes = await supabase
      .from("wholesale_buyer_notes")
      .select("buyer_id, created_at")
      .in(
        "buyer_id",
        rows.map((row) => row.id),
      )
      .order("created_at", { ascending: false });
    if (notes.error) console.error("Could not load the latest buyer notes", notes.error);
    for (const note of notes.data ?? []) {
      if (!lastNote.has(note.buyer_id as string)) lastNote.set(note.buyer_id as string, note.created_at as string);
    }
  }

  const anyFilter = filters.country !== null || filters.status !== null || filters.q !== "";

  return (
    <>
      <PageHeader
        title="Wholesale buyers"
        intro="Companies in India and the UAE that could buy in bulk, and how far each one is with you."
        action={
          <Link href="/admin/buyers/new" className="btn btn-primary">
            New buyer
          </Link>
        }
      />

      <form action="/admin/buyers" method="get" role="search" className="mt-6 flex max-w-xl flex-wrap items-end gap-2">
        {filters.country ? <input type="hidden" name="country" value={filters.country} /> : null}
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
        <div className="min-w-0 flex-1">
          <label htmlFor="buyer-search" className="text-sm font-semibold text-slate-800">
            Search by company
          </label>
          <input id="buyer-search" name="q" type="search" defaultValue={filters.q} maxLength={100} className={searchInput} />
        </div>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      <div className="mt-4 space-y-2">
        <FilterGroup label="Country">
          <FilterLink href={buyersHref({ ...filters, country: null, page: 1 })} active={filters.country === null}>
            All countries
          </FilterLink>
          {BUYER_COUNTRIES.map((country) => (
            <FilterLink key={country} href={buyersHref({ ...filters, country, page: 1 })} active={filters.country === country}>
              {countryName(country)}
            </FilterLink>
          ))}
        </FilterGroup>
        <FilterGroup label="Status">
          <FilterLink href={buyersHref({ ...filters, status: null, page: 1 })} active={filters.status === null}>
            All statuses
          </FilterLink>
          {BUYER_STATUSES.map((status) => (
            <FilterLink key={status} href={buyersHref({ ...filters, status, page: 1 })} active={filters.status === status}>
              {BUYER_STATUS_LABELS[status]}
            </FilterLink>
          ))}
        </FilterGroup>
        {anyFilter ? (
          <p>
            <Link href="/admin/buyers" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
              Clear filters
            </Link>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
          {anyFilter ? "No buyers match these filters." : "There are no buyers yet. Add the first one."}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-600">
            Showing {from + 1}–{from + rows.length} of {total} {total === 1 ? "buyer" : "buyers"}
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-0 border-collapse text-left">
              <caption className="sr-only">Wholesale buyers, by company name</caption>
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className={headCell}>
                    Company
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Country
                  </th>
                  <th scope="col" className={`${headCell} hidden md:table-cell`}>
                    Type
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Priority
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Last note (IST)
                  </th>
                  <th scope="col" className={headCell}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((row) => {
                  const noted = lastNote.get(row.id);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className={`${cell} min-w-0 [overflow-wrap:anywhere]`}>
                        <Link href={`/admin/buyers/${row.id}`} className="font-semibold text-navy underline underline-offset-4 hover:text-navy/80">
                          {row.company}
                        </Link>
                        <span className="mt-1 block text-xs text-slate-600">{[row.location, countryName(row.country)].filter(Boolean).join(", ")}</span>
                      </td>
                      <td className={`${cell} hidden sm:table-cell`}>{countryName(row.country)}</td>
                      <td className={`${cell} hidden min-w-0 [overflow-wrap:anywhere] md:table-cell`}>{row.buyer_type || "–"}</td>
                      <td className={`${cell} hidden sm:table-cell`}>{row.priority ? BUYER_PRIORITY_LABELS[row.priority] : "–"}</td>
                      <td className={`${cell} hidden whitespace-nowrap sm:table-cell`}>{noted ? formatDateIst(noted) : "–"}</td>
                      <td className={cell}>
                        <BuyerStatusBadge status={row.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={buyersHref({ ...filters, page: page - 1 })} rel="prev" className="btn btn-secondary">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold text-slate-700">
            Page {page} of {pages}
          </p>
          {page < pages ? (
            <Link href={buyersHref({ ...filters, page: page + 1 })} rel="next" className="btn btn-secondary">
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
