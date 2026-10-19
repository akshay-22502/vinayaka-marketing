import type { Metadata } from "next";
import { OfficeDetails } from "@/components/site/OfficeDetails";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getSiteSettings } from "@/lib/content/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the TerraTechBharat offices in India and the UAE, or request a quote online.",
};

export default async function ContactPage() {
  const settings = await getSiteSettings();

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Contact us"
        intro="Talk to the office closest to your project, or send us the details and we will reply with a quotation."
      />

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section
          aria-labelledby="india-office-heading"
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
        >
          <OfficeDetails
            title="India office"
            headingLevel={2}
            headingId="india-office-heading"
            address={settings.indiaAddress}
            phone={settings.indiaPhone}
            whatsapp={settings.indiaWhatsapp}
            email={settings.indiaEmail}
          />
        </section>
        <section
          aria-labelledby="uae-office-heading"
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
        >
          <OfficeDetails
            title="UAE office"
            headingLevel={2}
            headingId="uae-office-heading"
            address={settings.uaeAddress}
            phone={settings.uaePhone}
            whatsapp={settings.uaeWhatsapp}
            email={settings.uaeEmail}
          />
        </section>
      </div>

      <div className="mt-12">
        <QuoteCta
          heading="Request a quote"
          text="Send your product needs, quantities and delivery location. We reply with recommendations and a quotation."
        />
      </div>
    </div>
  );
}
