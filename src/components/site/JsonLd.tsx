import { serializeJsonLd, type JsonLdData } from "@/lib/seo";

/** Structured data for search engines, as a <script type="application/ld+json"> tag. */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes "<", so admin-entered text cannot close the tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
