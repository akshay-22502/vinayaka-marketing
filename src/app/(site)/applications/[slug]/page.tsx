import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { CoverImage } from "@/components/site/CoverImage";
import { Markdown } from "@/components/site/Markdown";
import { ProductCard } from "@/components/site/ProductCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getApplication, getApplications } from "@/lib/content/queries";
import { applicationPlaceholder } from "@/lib/media";
import { metaDescription, pageMetadata } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

export const revalidate = 3600;
// Applications published after the build are rendered on first visit, then cached.
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

// Called by both generateMetadata and the page; cache() makes it one query per request.
const loadApplication = cache(getApplication);

export async function generateStaticParams() {
  const applications = await getApplications();
  return applications.map((application) => ({ slug: application.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const application = await loadApplication(slug);
  if (!application) return {};
  return pageMetadata({
    title: application.name,
    description: metaDescription(application.summary),
    path: `/applications/${application.slug}`,
    image: publicMediaUrl(application.imagePath),
  });
}

export default async function ApplicationPage({ params }: Props) {
  const { slug } = await params;
  const application = await loadApplication(slug);
  if (!application) notFound();

  const photo = publicMediaUrl(application.imagePath);

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Applications", href: "/applications" },
          { label: application.name },
        ]}
      />
      <div className="mt-6">
        <SectionHeading level={1} title={application.name} intro={application.summary} />
      </div>

      <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:aspect-[21/9]">
        <CoverImage
          src={photo ?? applicationPlaceholder(application.slug)}
          alt={photo ? application.name : ""}
          sizes="(min-width: 1152px) 1088px, 100vw"
          priority
        />
      </div>

      {application.body.trim() !== "" ? (
        <div className="mt-10 min-w-0 max-w-3xl">
          <Markdown topHeading={2}>{application.body}</Markdown>
        </div>
      ) : null}

      <section aria-labelledby="products-used-heading" className="mt-14">
        <h2 id="products-used-heading" className="text-2xl font-bold tracking-tight text-navy">
          Products used
        </h2>
        {application.products.length > 0 ? (
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {application.products.map((product) => (
              <li key={`${product.categorySlug}/${product.slug}`} className="min-w-0">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-slate-700">
            Products for this application are being added. Request a quote and we will recommend the right ones.
          </p>
        )}
      </section>

      <div className="mt-16">
        <QuoteCta
          heading="Planning a project like this?"
          text="Tell us the location, quantities and ground conditions. We recommend the right products and send a quotation."
        />
      </div>
    </div>
  );
}
