import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { ProductCard } from "@/components/site/ProductCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { ScrollStory } from "@/components/site/ScrollStory";
import { getCategories, getCategoryWithProducts } from "@/lib/content/queries";
import { revealProps } from "@/lib/reveal";
import { storyFor } from "@/lib/scroll-stories";
import { metaDescription, pageMetadata } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

export const revalidate = 3600;
// Categories published after the build are rendered on first visit, then cached.
export const dynamicParams = true;

type Props = { params: Promise<{ category: string }> };

// Called by both generateMetadata and the page; cache() makes it one query per request.
const loadCategory = cache(getCategoryWithProducts);

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return {};
  return pageMetadata({
    title: category.name,
    description: metaDescription(category.intro),
    path: `/products/${category.slug}`,
    image: publicMediaUrl(category.imagePath),
  });
}

export default async function CategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();

  const story = storyFor(category.slug);
  const intro = (
    <>
      <p className="rise-in flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
        <span aria-hidden="true" className="h-0.5 w-10 bg-orange" />
        Products
      </p>
      <h1
        id="category-heading"
        className="rise-in mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.03em] [--rise-delay:80ms] sm:text-7xl lg:text-8xl"
      >
        {category.name}
      </h1>
      <p className="rise-in mt-6 max-w-xl text-lg leading-relaxed text-white/80 [--rise-delay:160ms] sm:text-xl">{category.intro}</p>
      <div className="rise-in mt-9 flex flex-wrap gap-3 [--rise-delay:240ms]">
        <Link href="/quote" className="btn btn-primary rounded-full px-6">
          Request a quote
        </Link>
        <Link href="#range" className="btn btn-light rounded-full px-6">
          See the range
        </Link>
      </div>
    </>
  );

  return (
    <>
      {story ? (
        <ScrollStory
          scene={story}
          labelledBy="category-heading"
          intro={intro}
          endLinks={[
            { href: "/quote", label: "Request a quote" },
            { href: "#range", label: "See the range" },
          ]}
        />
      ) : (
        <section aria-labelledby="category-heading" className="bg-[#060c1a] py-20 text-white sm:py-28">
          <div className="container-page max-w-2xl">{intro}</div>
        </section>
      )}

      <section id="range" aria-labelledby="range-heading" className="bg-white py-16 sm:py-24">
        <div className="container-page">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Products", href: "/products" },
              { label: category.name },
            ]}
          />
          <div data-reveal="" className="mt-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-dark">The range</p>
            <h2 id="range-heading" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-navy sm:text-6xl">
              Choose your {category.name.toLowerCase()}.
            </h2>
          </div>

          {category.products.length > 0 ? (
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {category.products.map((product, index) => (
                <li key={product.slug} {...revealProps(index)}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
              Products in this range are being added. Request a quote and we will recommend the right one for your project.
            </p>
          )}

          <div {...revealProps()} className="mt-16">
            <QuoteCta
              heading={`Need ${category.name.toLowerCase()} for a project?`}
              text="Tell us about the project and we will recommend products and send a quotation."
            />
          </div>
        </div>
      </section>
    </>
  );
}
