"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// /products/<category>/<product>: the segment after the category is the product slug.
const PRODUCT_PATH = /^\/products\/[^/]+\/([^/]+)\/?$/;

/**
 * Floating "Request a quote" button, bottom right on every public page. On a
 * product page it opens the quote form with that product selected
 * (`/quote?product=<slug>`). It hides on the quote page itself.
 */
export function QuoteFab() {
  // Never null in the App Router; the fallback only satisfies the types.
  const pathname = usePathname() ?? "";
  if (pathname === "/quote") return null;

  const productSlug = PRODUCT_PATH.exec(pathname)?.[1];
  const href = productSlug ? `/quote?product=${productSlug}` : "/quote";

  return (
    <Link
      href={href}
      data-testid="quote-fab"
      className="fixed bottom-4 right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-orange px-5 py-3 text-base font-bold text-slate-950 shadow-lg ring-1 ring-black/10 transition-colors hover:bg-[#e48a4c] sm:bottom-6 sm:right-6"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5M10 13h6M10 17h6" />
      </svg>
      Request a quote
    </Link>
  );
}
