import { OfficeDetails } from "@/components/site/OfficeDetails";
import { QuoteForm } from "@/components/site/QuoteForm";
import { SectionHeading } from "@/components/site/SectionHeading";
import { categoryOptions, getProductOptions, getSiteSettings } from "@/lib/content/queries";
import { env } from "@/lib/env";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Contact",
  description:
    "Contact the TerraTechBharat offices in India and the UAE, or request a quote online.",
  path: "/contact",
});

export default async function ContactPage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getProductOptions()]);
  const options = categoryOptions(products);

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

      <section aria-labelledby="contact-quote-heading" className="mt-12">
        <SectionHeading
          id="contact-quote-heading"
          title="Request a quote"
          intro="Send your product needs, quantities and delivery location. We reply with recommendations and a quotation."
        />
        <div className="mt-6">
          <QuoteForm options={options} preselected={[]} siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </div>
      </section>
    </div>
  );
}
