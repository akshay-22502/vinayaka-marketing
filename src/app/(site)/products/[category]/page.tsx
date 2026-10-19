import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { ProductCard } from "@/components/site/ProductCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getCategories, getCategoryWithProducts } from "@/lib/content/queries";

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
  return { title: category.name, description: category.intro.slice(0, 200) };
}

export default async function CategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: category.name },
        ]}
      />
      <div className="mt-6">
        <SectionHeading level={1} title={category.name} intro={category.intro} />
      </div>

      {category.products.length > 0 ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {category.products.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
          Products in this range are being added. Request a quote and we will recommend the right one for your project.
        </p>
      )}

      <div className="mt-16">
        <QuoteCta
          heading={`Need ${category.name.toLowerCase()} for a project?`}
          text="Tell us about the project and we will recommend products and send a quotation."
        />
      </div>
    </div>
  );
}
