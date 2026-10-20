import Link from "next/link";
import { QuoteForm } from "@/components/site/QuoteForm";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getProductOptions } from "@/lib/content/queries";
import { env } from "@/lib/env";
import { pageMetadata } from "@/lib/seo";

// Reading searchParams makes this page render per request. That is intended: the rest of the
// site stays static, and the form needs the visitor's `?product=` choice.

export const metadata = pageMetadata({
  title: "Request a quote",
  description:
    "Tell us about your project and the geosynthetic products you need. Our team in India or the UAE replies with recommendations and a quotation.",
  path: "/quote",
});

type Props = { searchParams: Promise<{ product?: string | string[] }> };

export default async function QuotePage({ searchParams }: Props) {
  const [{ product }, options] = await Promise.all([searchParams, getProductOptions()]);

  // `?product=<slug>` ticks that product, but only when it is on offer: an unknown, unpublished or
  // hidden slug opens the form with nothing ticked. `?product=a&product=b` ticks both.
  const requested = Array.isArray(product) ? product : product ? [product] : [];
  const offered = new Set(options.map((option) => option.slug));
  const preselected = [...new Set(requested)].filter((slug) => offered.has(slug));

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Request a quote"
        intro="Tell us about your project and what you need. The team in India or the UAE replies with recommendations and a quotation."
      />

      <div className="mt-8">
        {/* A new key remounts the form, so a changed ?product= is not hidden behind ticks the visitor already made. */}
        <QuoteForm
          key={preselected.join(",")}
          options={options}
          preselected={preselected}
          siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
      </div>

      <p className="mt-6 text-slate-600">
        Prefer to talk first?{" "}
        <Link href="/contact" className="font-medium text-navy underline underline-offset-2 hover:text-slate-900">
          See our India and UAE offices
        </Link>
        .
      </p>
    </div>
  );
}
