import type { Category } from "@/lib/content/types";
import { CategoryTile } from "../CategoryTile";
import { SectionHeading } from "../SectionHeading";

/** The product lines, one tile each. */
export function CategoryTiles({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="product-lines-heading" className="container-page py-14 sm:py-20">
      <SectionHeading
        id="product-lines-heading"
        eyebrow="Products"
        title="Our product lines"
        intro="Geosynthetics for reinforcement, lining, filtration and protection, each with a full specification table."
      />
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.slug}>
            <CategoryTile category={category} />
          </li>
        ))}
      </ul>
    </section>
  );
}
