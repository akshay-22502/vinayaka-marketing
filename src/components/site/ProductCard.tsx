import Link from "next/link";
import type { ProductSummary } from "@/lib/content/types";
import { categoryPlaceholder, mediaOr } from "@/lib/media";
import { CoverImage } from "./CoverImage";

/** A product in a listing: photo (or the category placeholder), name and summary. The whole card is one link. */
export function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/products/${product.categorySlug}/${product.slug}`;
  const src = mediaOr(product.coverImage, categoryPlaceholder(product.categorySlug));

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
      <div className="relative aspect-[4/3] bg-slate-100">
        <CoverImage src={src} alt="" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-semibold text-navy">
          <Link href={href} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-slate-600">{product.summary}</p>
        <p className="mt-4 text-sm font-semibold text-navy" aria-hidden="true">
          View specifications <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
        </p>
      </div>
    </article>
  );
}
