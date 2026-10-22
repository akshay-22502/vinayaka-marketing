"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/admin/actions";

const SECTIONS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Quotes", href: "/admin/quotes" },
  { label: "Buyers", href: "/admin/buyers" },
  { label: "Suppliers", href: "/admin/suppliers" },
  { label: "Purchases", href: "/admin/purchases" },
  { label: "Document categories", href: "/admin/document-categories" },
  { label: "Products", href: "/admin/products" },
  { label: "Categories", href: "/admin/categories" },
  { label: "Applications", href: "/admin/applications" },
  { label: "Certifications", href: "/admin/certifications" },
  { label: "Projects", href: "/admin/projects" },
  { label: "Settings", href: "/admin/settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass = "block rounded-md px-3 py-2.5 text-[15px] font-medium";

/**
 * The navy admin sidebar. From the `lg` breakpoint up it is a fixed column; below that it is
 * a bar with a Menu button that shows or hides the list (a disclosure: Tab reaches every
 * link in order, Escape closes it). The list closes by itself when the page changes.
 */
export function AdminNav() {
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
    <aside className="bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:h-[72px]">
        <Link href="/admin" className="flex min-w-0 items-center gap-2 rounded-md">
          <Image src="/brand/logo.png" alt="" width={382} height={314} unoptimized className="h-10 w-auto shrink-0" />
          <span className="min-w-0 text-lg font-bold leading-tight tracking-tight">TerraTechBharat Admin</span>
        </Link>

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpenOn(open ? null : pathname)}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-white/40 px-3.5 text-base font-semibold text-white hover:bg-white/10 lg:hidden"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          Menu
        </button>
      </div>

      <nav id="admin-nav" aria-label="Admin" className={`${open ? "block" : "hidden"} px-3 pb-6 lg:block`}>
        <ul className="space-y-1">
          {SECTIONS.map(({ label, href }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${linkClass} ${active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <form action={signOut} className="mt-6 border-t border-white/15 pt-4">
          <button type="submit" className={`${linkClass} w-full text-left text-white/85 hover:bg-white/10 hover:text-white`}>
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}
