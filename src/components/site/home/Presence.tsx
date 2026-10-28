import Link from "next/link";
import type { SiteSettings } from "@/lib/content/types";
import { OfficeDetails } from "../OfficeDetails";
import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

/** Both offices side by side. */
export function Presence({ settings }: { settings: SiteSettings }) {
  return (
    <section aria-labelledby="presence-heading" className="bg-slate-50 py-14 sm:py-20">
      <div className="container-page">
        <div {...revealProps()}>
          <SectionHeading
            id="presence-heading"
            eyebrow="Where we work"
            title="India and the UAE"
            intro="Talk to the office closest to your project."
          />
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div {...revealProps(0)} className="rounded-xl border border-slate-200 bg-white p-6">
            <OfficeDetails
              title="India"
              address={settings.indiaAddress}
              phone={settings.indiaPhone}
              whatsapp={settings.indiaWhatsapp}
              email={settings.indiaEmail}
            />
          </div>
          <div {...revealProps(1)} className="rounded-xl border border-slate-200 bg-white p-6">
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
