"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavLink } from "@/lib/nav";

/**
 * The navigation below the `lg` breakpoint: a Menu button that shows or hides a
 * panel under the header. It is a disclosure (button + aria-expanded), so Tab
 * reaches every link in order; Escape closes it and returns focus to the button.
 * The panel closes by itself when the page changes.
 */
export function MobileMenu({ links }: { links: NavLink[] }) {
  // Never null in the App Router; the fallback only satisfies the types.
  const pathname = usePathname() ?? "";
  // Remember which page the menu was opened on: navigating elsewhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? "mobile-menu" : undefined}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/40 px-3.5 text-base font-semibold text-white hover:bg-white/10"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full z-50 border-t border-white/15 bg-navy px-4 pb-5 pt-2 shadow-xl sm:px-6"
        >
          <ul>
            {links.map((link) => (
              <li key={link.href} className="border-b border-white/15">
                <Link
                  href={link.href}
                  onClick={() => setOpenOn(null)}
                  className="block py-3.5 text-lg font-medium text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/quote" onClick={() => setOpenOn(null)} className="btn btn-primary mt-5 w-full">
            Request a quote
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
