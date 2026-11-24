"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { buyersHref, type BuyerFilters } from "@/lib/admin/buyers";

// The search box and City filter on the buyers list. The list updates as you type (after a short
// pause) and as soon as a city is picked, by replacing the address, so the server page reloads the
// rows and Back still leaves the list. Without JavaScript the form still submits as a normal GET.

const SEARCH_DELAY_MS = 300;

const control =
  "mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm";

type Props = {
  filters: BuyerFilters;
  /** The cities to offer, already narrowed to the chosen country. */
  cities: readonly string[];
};

export function BuyerListControls({ filters, cities }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // A link elsewhere on the page (Clear filters, a country) can change the search; follow it
  // unless the admin is typing in the box right now.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(filters.q);
  }, [filters.q]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function go(next: Partial<BuyerFilters>) {
    const href = buyersHref({ ...filters, q: text.trim(), ...next, page: 1 });
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function onType(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (value.trim() !== filters.q) go({ q: value.trim() });
    }, SEARCH_DELAY_MS);
  }

  return (
    <form
      action="/admin/buyers"
      method="get"
      role="search"
      aria-busy={pending}
      className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go({ q: text.trim() });
      }}
    >
      {filters.country ? <input type="hidden" name="country" value={filters.country} /> : null}
      {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
      <div className="min-w-0">
        <label htmlFor="buyer-search" className="text-sm font-semibold text-slate-800">
          Search by company
        </label>
        <input
          ref={input}
          id="buyer-search"
          name="q"
          type="search"
          value={text}
          onChange={(event) => onType(event.target.value)}
          maxLength={100}
          autoComplete="off"
          className={control}
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="buyer-city" className="text-sm font-semibold text-slate-800">
          City
        </label>
        <select
          id="buyer-city"
          name="city"
          value={filters.city}
          onChange={(event) => go({ city: event.target.value })}
          className={control}
        >
          <option value="">All cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
          {filters.city !== "" && !cities.includes(filters.city) ? <option value={filters.city}>{filters.city}</option> : null}
        </select>
      </div>
      <noscript>
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </noscript>
    </form>
  );
}
