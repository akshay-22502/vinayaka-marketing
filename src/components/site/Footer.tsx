import Link from "next/link";
import { mainNavLinks } from "@/lib/nav";
import type { SiteSettings } from "@/lib/content/types";
import { Logo } from "./Logo";
import { OfficeDetails } from "./OfficeDetails";

type Props = {
  settings: SiteSettings;
  nav: { certifications: boolean; projects: boolean };
};

/** Navy footer on every page: the brand, quick links, and both offices. */
export function Footer({ settings, nav }: Props) {
  const links = [...mainNavLinks(nav), { href: "/quote", label: "Request a quote" }];

  return (
    // Bottom padding keeps the last lines clear of the floating quote button.
    <footer className="bg-navy pb-24 pt-12 text-white sm:pb-20">
      <div className="container-page grid gap-10 md:grid-cols-2 lg:grid-cols-[1.1fr_0.7fr_1fr_1fr]">
        <div>
          <Logo />
          {settings.tagline ? <p className="mt-3 max-w-xs text-white/80">{settings.tagline}</p> : null}
        </div>

        <nav aria-label="Footer">
          <h2 className="text-lg font-semibold">Explore</h2>
          <ul className="mt-3 space-y-1.5">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-sm text-white/80 underline-offset-2 hover:text-white hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <OfficeDetails
          tone="dark"
          headingLevel={2}
          title="India office"
          address={settings.indiaAddress}
          phone={settings.indiaPhone}
          whatsapp={settings.indiaWhatsapp}
          email={settings.indiaEmail}
        />
        <OfficeDetails
          tone="dark"
          headingLevel={2}
          title="UAE office"
          address={settings.uaeAddress}
          phone={settings.uaePhone}
          whatsapp={settings.uaeWhatsapp}
          email={settings.uaeEmail}
        />
      </div>

      <div className="container-page mt-10">
        <p className="border-t border-white/20 pt-6 text-sm text-white/70">
          &copy; {new Date().getFullYear()} TerraTechBharat. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
