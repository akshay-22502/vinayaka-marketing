import type { Metadata } from "next";
import { CategoryTile } from "@/components/site/CategoryTile";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getCategories } from "@/lib/content/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Products",
  description:
    "Geogrids, geomembranes, geotextiles and geocells with full specification tables, for projects in India and the UAE.",
};

export default async function ProductsPage() {
  const categories = await getCategories();

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Products"
        intro="Choose a product line to see its range and specifications."
      />
      {categories.length > 0 ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <CategoryTile category={category} headingLevel={2} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-slate-600">Our product catalogue is being prepared. Please check back soon.</p>
      )}
      <div className="mt-16">
        <QuoteCta
          heading="Not sure which product you need?"
          text="Tell us about the project and we will recommend the right products."
        />
      </div>
    </div>
  );
}
