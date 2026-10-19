import { JsonLd } from "@/components/site/JsonLd";
import type { Product } from "@/lib/content/types";
import { productJsonLd } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

/** schema.org Product data for a product page (without prices: the site has none). */
export function ProductJsonLd({ product, categoryName }: { product: Product; categoryName: string }) {
  return (
    <JsonLd
      data={productJsonLd({
        name: product.name,
        summary: product.summary,
        image: publicMediaUrl(product.coverImage),
        category: categoryName,
        path: `/products/${product.categorySlug}/${product.slug}`,
      })}
    />
  );
}
