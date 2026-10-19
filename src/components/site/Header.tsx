import Link from "next/link";
import { mainNavLinks } from "@/lib/nav";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";

/** Navy header on every page: logo, main navigation and the Request a quote button. */
export function Header({ nav }: { nav: { certifications: boolean; projects: boolean } }) {
  const links = mainNavLinks(nav);

  return (
    <header className="relative bg-navy text-white">
      <div className="container-page flex h-16 items-center justify-between gap-3 lg:h-[72px]">
        <Logo priority large />

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-2 text-[15px] font-medium text-white/90 hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/quote" className="btn btn-primary hidden lg:inline-flex">
            Request a quote
          </Link>
          <MobileMenu links={links} />
        </div>
      </div>
    </header>
  );
}
