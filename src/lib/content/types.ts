// Public content types: what the website reads, in camelCase.
//
// Fields named `...Path`, `images` and `coverImage` hold storage paths inside
// the `public-media` bucket (or null). Turn one into a URL with
// `publicMediaUrl()` from "@/lib/storage" when rendering.

export type Country = "IN" | "AE";

/** A product's spec table: models are the columns, `rows` the properties. */
export type SpecGrid = {
  models: string[];
  rows: {
    name: string;
    unit: string | null;
    testMethod: string | null;
    /** One entry per model, in model order. `null` marks a cell with no value. */
    values: (string | null)[];
  }[];
};

export type Category = {
  slug: string;
  name: string;
  intro: string;
  imagePath: string | null;
};

export type ProductSummary = {
  slug: string;
  name: string;
  summary: string;
  categorySlug: string;
  /** First product image, or null when the product has none. */
  coverImage: string | null;
};

export type Product = ProductSummary & {
  /** Markdown. */
  overview: string;
  features: string[];
  images: string[];
  datasheetPath: string | null;
  specGrid: SpecGrid;
  /** Published applications this product is used in. */
  applications: { slug: string; name: string }[];
};

export type Application = {
  slug: string;
  name: string;
  summary: string;
  /** Markdown. */
  body: string;
  imagePath: string | null;
};

export type Certification = {
  id: string;
  name: string;
  issuer: string;
  /** ISO date (YYYY-MM-DD), or null when it does not expire. */
  validUntil: string | null;
  filePath: string | null;
  imagePath: string | null;
};

export type Project = {
  slug: string;
  title: string;
  location: string;
  country: Country;
  summary: string;
  /** Markdown. */
  body: string;
  images: string[];
  /** First project image, or null when the project has none. */
  coverImage: string | null;
  /** Published products (in published categories) used on the project. */
  products: ProductSummary[];
};

export type SiteSettings = {
  tagline: string;
  heroTitle: string;
  heroText: string;
  /** Markdown. */
  aboutMd: string;
  indiaAddress: string;
  indiaPhone: string;
  indiaWhatsapp: string;
  indiaEmail: string;
  uaeAddress: string;
  uaePhone: string;
  uaeWhatsapp: string;
  uaeEmail: string;
};
