import type { Metadata } from "next";
import Link from "next/link";
import { EmailNotSentBadge, QuoteStatusBadge } from "@/components/admin/QuoteBadges";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  QUOTE_COUNTRIES,
  QUOTE_STATUSES,
  clampPage,
  pageCount,
  parseQuoteFilters,
  quotesHref,
  rangeForPage,
  type QuoteFilters,
} from "@/lib/admin/quote-filters";
import { QUOTE_STATUS_LABELS, productLabels } from "@/lib/admin/quote-view";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { Country } from "@/lib/content/types";
import { countryName, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Quote requests" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type QuoteListRow = {
  id: string;
  name: string;
  company: string | null;
  country: Country;
  products: string[];
  status: string;
  email_sent: boolean;
  created_at: string;
};

const LIST_COLUMNS = "id, name, company, country, products, status, email_sent, created_at";

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

/** Names for the product slugs on this page's requests. A failed lookup only means slugs are shown instead. */
async function productNames(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  rows: QuoteListRow[],
): Promise<Map<string, string>> {
  const slugs = [...new Set(rows.flatMap((row) => row.products))];
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase.from("products").select("slug, name").in("slug", slugs);
  if (error) {
    console.error("Could not look up product names for the quote list", error);
    return new Map();
  }
  return new Map((data ?? []).map((product) => [product.slug as string, product.name as string]));
}

export default async function QuotesPage({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const filters: QuoteFilters = parseQuoteFilters(await searchParams);

  // Counted first, so a page past the end can be pulled back to the last page.
  let countQuery = supabase.from("quote_requests").select("id", { count: "exact", head: true });
  if (filters.status) countQuery = countQuery.eq("status", filters.status);
  if (filters.country) countQuery = countQuery.eq("country", filters.country);
  const counted = await countQuery;
  if (counted.error) throw new Error(`Could not count quote requests: ${counted.error.message}`);

  const total = counted.count ?? 0;
  const page = clampPage(filters.page, total);
  const pages = pageCount(total);
  const { from, to } = rangeForPage(page);

  // Newest first; the id breaks ties so a request never moves between pages.
  let listQuery = supabase.from("quote_requests").select(LIST_COLUMNS).order("created_at", { ascending: false }).order("id").range(from, to);
  if (filters.status) listQuery = listQuery.eq("status", filters.status);
  if (filters.country) listQuery = listQuery.eq("country", filters.country);
  const listed = await listQuery;
  if (listed.error) throw new Error(`Could not load quote requests: ${listed.error.message}`);

  const rows = (listed.data ?? []) as QuoteListRow[];
  const names = await productNames(supabase, rows);
  const filtered = filters.status !== null || filters.country !== null;

  return (
    <>
      <PageHeader title="Quote requests" intro="Requests sent through the quote form on the website, newest first." />

      <div className="mt-6 space-y-2">
        <FilterGroup label="Status">
          <FilterLink href={quotesHref({ country: filters.country })} active={filters.status === null}>
            All statuses
          </FilterLink>
          {QUOTE_STATUSES.map((status) => (
            <FilterLink key={status} href={quotesHref({ status, country: filters.country })} active={filters.status === status}>
              {QUOTE_STATUS_LABELS[status]}
            </FilterLink>
          ))}
        </FilterGroup>
        <FilterGroup label="Country">
          <FilterLink href={quotesHref({ status: filters.status })} active={filters.country === null}>
            All countries
          </FilterLink>
          {QUOTE_COUNTRIES.map((country) => (
            <FilterLink key={country} href={quotesHref({ status: filters.status, country })} active={filters.country === country}>
              {countryName(country)}
            </FilterLink>
          ))}
        </FilterGroup>
        {filtered ? (
          <p>
            <Link href="/admin/quotes" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
              Clear filters
            </Link>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
          {filtered
            ? "No quote requests match these filters."
            : "There are no quote requests yet. They appear here when someone sends the quote form."}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-600">
            Showing {from + 1}–{from + rows.length} of {total} {total === 1 ? "request" : "requests"}
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-0 border-collapse text-left">
              <caption className="sr-only">Quote requests, newest first</caption>
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className={headCell}>
                    Name
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Company
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Country
                  </th>
                  <th scope="col" className={`${headCell} hidden md:table-cell`}>
                    Products
                  </th>
                  <th scope="col" className={`${headCell} hidden sm:table-cell`}>
                    Received
                  </th>
                  <th scope="col" className={headCell}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((row) => {
                  const products = productLabels(row.products, names);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className={`${cell} min-w-0 [overflow-wrap:anywhere]`}>
                        <Link href={`/admin/quotes/${row.id}`} className="font-semibold text-navy underline underline-offset-4 hover:text-navy/80">
                          {row.name}
                        </Link>
                        <span className="mt-1 block text-xs text-slate-600 sm:hidden">
                          {countryName(row.country)} · {formatDate(row.created_at)}
                        </span>
                      </td>
                      <td className={`${cell} hidden min-w-0 [overflow-wrap:anywhere] sm:table-cell`}>{row.company || "–"}</td>
                      <td className={`${cell} hidden sm:table-cell`}>{countryName(row.country)}</td>
                      <td className={`${cell} hidden min-w-0 [overflow-wrap:anywhere] md:table-cell`}>{products.length > 0 ? products.join(", ") : "–"}</td>
                      <td className={`${cell} hidden whitespace-nowrap sm:table-cell`}>{formatDate(row.created_at)}</td>
                      <td className={cell}>
                        <div className="flex flex-col items-start gap-1.5">
                          <QuoteStatusBadge status={row.status} />
                          {row.email_sent ? null : <EmailNotSentBadge />}
                        </div>
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
            <Link href={quotesHref({ ...filters, page: page - 1 })} rel="prev" className="btn btn-secondary">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold text-slate-700">
            Page {page} of {pages}
          </p>
          {page < pages ? (
            <Link href={quotesHref({ ...filters, page: page + 1 })} rel="next" className="btn btn-secondary">
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
