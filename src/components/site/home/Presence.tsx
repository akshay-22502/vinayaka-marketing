import Link from "next/link";
import type { SiteSettings } from "@/lib/content/types";
import { OfficeDetails } from "../OfficeDetails";
import { revealProps } from "@/lib/reveal";

/** Both offices side by side. */
export function Presence({ settings }: { settings: SiteSettings }) {
  return (
    <section aria-labelledby="presence-heading" className="bg-white py-20 sm:py-28">
      <div className="container-page">
        <div {...revealProps()} className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-dark">Where we work</p>
          <h2 id="presence-heading" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-navy sm:text-6xl">
            India and the UAE.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600 sm:text-xl">Talk to the office closest to your project.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div {...revealProps(0)} className="rounded-[2rem] bg-[#f5f5f7] p-8 sm:p-10">
            <OfficeDetails
              title="India"
              address={settings.indiaAddress}
              phone={settings.indiaPhone}
              whatsapp={settings.indiaWhatsapp}
              email={settings.indiaEmail}
            />
          </div>
          <div {...revealProps(1)} className="rounded-[2rem] bg-[#f5f5f7] p-8 sm:p-10">
            <OfficeDetails
              title="UAE"
              address={settings.uaeAddress}
              phone={settings.uaePhone}
              whatsapp={settings.uaeWhatsapp}
              email={settings.uaeEmail}
            />
          </div>
        </div>
        <p className="mt-8">
          <Link href="/contact" className="font-semibold text-navy underline underline-offset-4">
            Contact us
          </Link>
        </p>
      </div>
    </section>
  );
}
