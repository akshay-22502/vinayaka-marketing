import type { Category } from "@/lib/content/types";
import { CategoryTile } from "../CategoryTile";
import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

/** The product lines, one tile each. */
export function CategoryTiles({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="product-lines-heading" className="container-page py-14 sm:py-20">
      <div {...revealProps()}>
        <SectionHeading
          id="product-lines-heading"
          eyebrow="Products"
          title="Our product lines"
          intro="Geosynthetics for reinforcement, lining, filtration and protection, each with a full specification table."
        />
      </div>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category, index) => (
          <li key={category.slug} {...revealProps(index)}>
            <CategoryTile category={category} />
          </li>
        ))}
      </ul>
    </section>
  );
}
