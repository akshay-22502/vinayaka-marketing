import type { CSSProperties } from "react";
import Link from "next/link";
import type { Category } from "@/lib/content/types";
import { categoryPlaceholder, mediaOr } from "@/lib/media";
import { CoverImage } from "../CoverImage";

/**
 * The product lines as large cards that pin and stack on top of each other while scrolling,
 * each with its photo (or default render), name, intro and a link to the line.
 */
export function ProductLines({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="product-lines-heading" className="bg-[#060c1a] pb-24 pt-20 text-white sm:pb-32 sm:pt-28">
      <div className="container-page">
        <div data-reveal="" className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange">Products</p>
          <h2 id="product-lines-heading" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {categories.length === 4 ? "Four product lines." : "Our product lines."} <span className="text-white/45">One supplier.</span>
          </h2>
        </div>
        <ul className="mt-14 sm:mt-20">
          {categories.map((category, index) => (
            <li
              key={category.slug}
              style={{ "--stack": index } as CSSProperties}
              className="sticky top-[calc(5rem+var(--stack)*1rem)] pb-8 sm:top-[calc(6rem+var(--stack)*1.25rem)] sm:pb-12"
            >
              <article
                data-testid="category-tile"
                className="group relative grid overflow-hidden rounded-[2rem] bg-[#eef1f5] text-slate-900 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.6)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange lg:min-h-[32rem] lg:grid-cols-[0.9fr_1.1fr]"
              >
                <div className="relative order-2 flex flex-col justify-center p-7 sm:p-10 lg:order-1 lg:p-14">
                  <p className="font-mono text-sm text-slate-500">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-navy sm:text-5xl">
                    <Link href={`/products/${category.slug}`} className="after:absolute after:inset-0">
                      {category.name}
                    </Link>
                  </h3>
                  <p className="mt-4 line-clamp-4 text-lg leading-relaxed text-slate-600">{category.intro}</p>
                  <p className="mt-6 text-base font-semibold text-orange-dark" aria-hidden="true">
                    Explore {category.name}{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
                  </p>
                </div>
                <div className="relative order-1 aspect-[4/3] lg:order-2 lg:aspect-auto">
                  <CoverImage
                    src={mediaOr(category.imagePath, categoryPlaceholder(category.slug))}
                    alt=""
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-105"
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
