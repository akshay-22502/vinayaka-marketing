import Link from "next/link";
import type { Category } from "@/lib/content/types";
import { categoryPlaceholder, mediaOr } from "@/lib/media";
import { CoverImage } from "./CoverImage";

type Props = {
  category: Category;
  /** Heading level of the category name: 2 on pages where the tiles are the main content, 3 under a section heading. */
  headingLevel?: 2 | 3;
};

/** A product line: photo (or placeholder), name and intro. The whole tile is one link. */
export function CategoryTile({ category, headingLevel = 3 }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const src = mediaOr(category.imagePath, categoryPlaceholder(category.slug));

  return (
    <article
      data-testid="category-tile"
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange"
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        <CoverImage src={src} alt="" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" />
      </div>
      <div className="flex flex-1 flex-col border-t-4 border-orange p-5">
        <Heading className="text-xl font-bold text-navy">
          <Link
            href={`/products/${category.slug}`}
            className="after:absolute after:inset-0"
          >
            {category.name}
          </Link>
        </Heading>
        <p className="mt-2 line-clamp-4 text-slate-600">{category.intro}</p>
        <p className="mt-4 text-sm font-semibold text-navy" aria-hidden="true">
          Browse {category.name}{" "}
          <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
        </p>
      </div>
    </article>
  );
}
