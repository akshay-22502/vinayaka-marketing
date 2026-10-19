import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { Markdown } from "@/components/site/Markdown";
import { ProductGallery } from "@/components/site/ProductGallery";
import { ProductJsonLd } from "@/components/site/ProductJsonLd";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SpecTable } from "@/components/site/SpecTable";
import {
  getCategories,
  getCategoryWithProducts,
  getProduct,
} from "@/lib/content/queries";
import { categoryPlaceholder } from "@/lib/media";
import { metaDescription, pageMetadata } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

export const revalidate = 3600;
// Products published after the build are rendered on first visit, then cached.
export const dynamicParams = true;

type Props = { params: Promise<{ category: string; product: string }> };

// Called by both generateMetadata and the page; cache() makes it one query per request.
const loadProduct = cache(getProduct);

export async function generateStaticParams() {
  const categories = await getCategories();
  const perCategory = await Promise.all(
    categories.map(async (category) => {
      const withProducts = await getCategoryWithProducts(category.slug);
      return (withProducts?.products ?? []).map((product) => ({
        category: category.slug,
        product: product.slug,
      }));
    }),
  );
  return perCategory.flat();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, product: slug } = await params;
  const product = await loadProduct(category, slug);
  if (!product) return {};
  return pageMetadata({
    title: product.name,
    description: metaDescription(product.summary),
    path: `/products/${product.categorySlug}/${product.slug}`,
    image: publicMediaUrl(product.coverImage),
  });
}

export default async function ProductPage({ params }: Props) {
  const { category: categorySlug, product: productSlug } = await params;
  const product = await loadProduct(categorySlug, productSlug);
  if (!product) notFound();

  // The product only knows its category's slug; the breadcrumb shows the name.
  const categories = await getCategories();
  const categoryName =
    categories.find((category) => category.slug === product.categorySlug)?.name ?? product.categorySlug;

  const images = product.images.flatMap((path) => publicMediaUrl(path) ?? []);
  const datasheetUrl = publicMediaUrl(product.datasheetPath);
  const hasSpecs = product.specGrid.rows.length > 0;

  return (
    <div className="container-page py-8 sm:py-12">
      <ProductJsonLd product={product} categoryName={categoryName} />
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: categoryName, href: `/products/${product.categorySlug}` },
          { label: product.name },
        ]}
      />

      <div className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">{product.name}</h1>
        {product.summary ? (
          <p className="mt-3 text-lg leading-relaxed text-slate-600">{product.summary}</p>
        ) : null}
      </div>

      {/* grid-cols-1 is minmax(0, 1fr), and min-w-0 lets each item shrink below its content,
          so a long unbroken URL in the Markdown wraps instead of widening the page. */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="min-w-0">
          <ProductGallery
            productName={product.name}
            images={images}
            placeholder={categoryPlaceholder(product.categorySlug)}
          />
        </div>
        <div className="min-w-0">
          <section aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="text-2xl font-bold tracking-tight text-navy">
              Overview
            </h2>
            <Markdown className="mt-4">{product.overview}</Markdown>
          </section>

          {product.features.length > 0 ? (
            <section aria-labelledby="features-heading" className="mt-10">
              <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-navy">
                Features
              </h2>
              <ul className="mt-4 space-y-2.5">
                {product.features.map((feature, index) => (
                  <li key={`${index}-${feature}`} className="flex gap-3 text-slate-700">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="mt-1 size-5 shrink-0 text-orange"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="specs-heading" className="mt-14">
        <h2 id="specs-heading" className="text-2xl font-bold tracking-tight text-navy">
          Specifications
        </h2>
        {hasSpecs ? (
          <>
            <div className="mt-5">
              <SpecTable grid={product.specGrid} caption={`${product.name} specifications`} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Typical values. Contact us to confirm the specification for your project.
            </p>
          </>
        ) : (
          <p className="mt-4 text-slate-700">
            The specification table for this product is being prepared. Request a quote and we will send the details.
          </p>
        )}
      </section>

      {product.applications.length > 0 ? (
        <section aria-labelledby="applications-heading" className="mt-14">
          <h2 id="applications-heading" className="text-2xl font-bold tracking-tight text-navy">
            Applications
          </h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {product.applications.map((application) => (
              <li key={application.slug}>
                <Link
                  href={`/applications/${application.slug}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-navy hover:border-navy hover:bg-slate-50"
                >
                  {application.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {datasheetUrl ? (
        <div className="mt-10">
          <a href={datasheetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
            </svg>
            Download datasheet (PDF)
          </a>
        </div>
      ) : null}

      <div className="mt-14">
        <QuoteCta
          heading={`Need ${product.name} for your project?`}
          text="Tell us the quantity and delivery location. We reply with a quotation and, where useful, the technical datasheet."
          href={`/quote?product=${encodeURIComponent(product.slug)}`}
        />
      </div>
    </div>
  );
}
