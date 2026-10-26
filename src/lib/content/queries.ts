// Every read the public site makes, run as an anonymous visitor.
//
// Rules applied by every query here:
//  - Only published rows come back.
//  - A product also needs its category to be published. The database policy
//    only checks the product row, so a published product in an unpublished
//    category would otherwise leak into pages, option lists and the sitemap.
//    Top-level product queries join the category with `categories!inner` and
//    filter on `categories.published`; products embedded in other rows (a
//    project's products, say) are filtered with `isListed()`.
//  - A row that is not found (or not visible) gives `null`; a failed query
//    throws, so a database error never looks like "page not found" and a
//    cached page is not replaced by an empty one.
//
// Storage paths (images, datasheets, ...) are returned as stored; use
// `publicMediaUrl()` from "@/lib/storage" to turn them into URLs.

import { getPublicClient } from "@/lib/supabase/public";
import { toSpecGrid, type SpecModelRow, type SpecPropertyRow, type SpecValueRow } from "./spec-grid";
import type {
  Application,
  Category,
  Certification,
  Country,
  Product,
  ProductSummary,
  Project,
  SiteSettings,
} from "./types";

// Query helpers ---------------------------------------------------------------

type QueryResult = { data: unknown; error: { message: string } | null };

async function readRows<T>(query: PromiseLike<QueryResult>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
  return (data ?? []) as T[];
}

async function readRow<T>(query: PromiseLike<QueryResult>, what: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
  return (data ?? null) as T | null;
}

const bySortOrderThenName = (
  a: { sort_order: number; name: string },
  b: { sort_order: number; name: string },
) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Latest of some timestamps, as ISO text; `fallback` when there are none. */
function latest(timestamps: string[], fallback: string): string {
  const millis = timestamps.map((t) => Date.parse(t)).filter((t) => !Number.isNaN(t));
  return millis.length > 0 ? new Date(Math.max(...millis)).toISOString() : fallback;
}

const toIso = (timestamp: string) => latest([timestamp], timestamp);

// Products --------------------------------------------------------------------

type CategoryRef = { slug: string; published: boolean };

type ProductSummaryRow = {
  slug: string;
  name: string;
  summary: string;
  images: string[];
  sort_order: number;
  categories: CategoryRef | null;
};

const PRODUCT_SUMMARY_COLUMNS = "slug, name, summary, images, sort_order";

function toProductSummary(row: ProductSummaryRow, categorySlug: string): ProductSummary {
  return {
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    categorySlug,
    coverImage: row.images[0] ?? null,
  };
}

/**
 * Published products in published categories, as a query the caller can narrow
 * and order further. `extraColumns` adds more to the select (for example a
 * `product_applications!inner(...)` join to filter on).
 */
function listedProducts(extraColumns = "") {
  return getPublicClient()
    .from("products")
    .select(`${PRODUCT_SUMMARY_COLUMNS}, categories!inner(slug, published)${extraColumns}`)
    .eq("published", true)
    .eq("categories.published", true);
}

/** For products embedded in another row, where an inner join is not available. */
type EmbeddedProduct = Omit<ProductSummaryRow, "categories"> & {
  published: boolean;
  categories: CategoryRef | null;
};

function isListed(
  product: EmbeddedProduct | null,
): product is EmbeddedProduct & { categories: CategoryRef } {
  return !!product && product.published && !!product.categories?.published;
}

const EMBEDDED_PRODUCT_COLUMNS = `${PRODUCT_SUMMARY_COLUMNS}, published, categories(slug, published)`;

function listedSummaries(products: (EmbeddedProduct | null)[]): ProductSummary[] {
  return products
    .filter(isListed)
    .sort(bySortOrderThenName)
    .map((p) => toProductSummary(p, p.categories.slug));
}

// Categories ------------------------------------------------------------------

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  intro: string;
  image_path: string | null;
};

const CATEGORY_COLUMNS = "id, slug, name, intro, image_path";

function toCategory(row: CategoryRow): Category {
  return { slug: row.slug, name: row.name, intro: row.intro, imagePath: row.image_path };
}

export async function getCategories(): Promise<Category[]> {
  const rows = await readRows<CategoryRow>(
    getPublicClient()
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("published", true)
      .order("sort_order")
      .order("name"),
    "categories",
  );
  return rows.map(toCategory);
}

export async function getCategoryWithProducts(
  slug: string,
): Promise<(Category & { products: ProductSummary[] }) | null> {
  const category = await readRow<CategoryRow>(
    getPublicClient()
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle(),
    `category ${slug}`,
  );
  if (!category) return null;

  const products = await readRows<ProductSummaryRow>(
    listedProducts()
      .eq("categories.slug", slug)
      .order("sort_order")
      .order("name"),
    `products of category ${slug}`,
  );
  return {
    ...toCategory(category),
    products: products.map((p) => toProductSummary(p, category.slug)),
  };
}

// Product detail --------------------------------------------------------------

type ProductRow = ProductSummaryRow & {
  overview: string;
  features: string[];
  datasheet_path: string | null;
  spec_models: SpecModelRow[];
  spec_properties: (SpecPropertyRow & { spec_values: SpecValueRow[] })[];
  product_applications: {
    applications: { slug: string; name: string; sort_order: number; published: boolean } | null;
  }[];
};

const PRODUCT_DETAIL_COLUMNS = `
  ${PRODUCT_SUMMARY_COLUMNS}, overview, features, datasheet_path,
  categories!inner(slug, published),
  spec_models(id, code, sort_order),
  spec_properties(id, name, unit, test_method, sort_order,
    spec_values(property_id, model_id, value)),
  product_applications(applications(slug, name, sort_order, published))
`;

/** A product page's data, or null when the product is not published, not in that category, or its category is not published. */
export async function getProduct(
  categorySlug: string,
  productSlug: string,
): Promise<Product | null> {
  const row = await readRow<ProductRow>(
    getPublicClient()
      .from("products")
      .select(PRODUCT_DETAIL_COLUMNS)
      .eq("slug", productSlug)
      .eq("published", true)
      .eq("categories.slug", categorySlug)
      .eq("categories.published", true)
      .maybeSingle(),
    `product ${categorySlug}/${productSlug}`,
  );
  if (!row?.categories) return null;

  const values = row.spec_properties.flatMap((property) => property.spec_values);
  const applications = row.product_applications
    .flatMap((link) => (link.applications?.published ? [link.applications] : []))
    .sort(bySortOrderThenName)
    .map((application) => ({ slug: application.slug, name: application.name }));

  return {
    ...toProductSummary(row, row.categories.slug),
    overview: row.overview,
    features: row.features,
    images: row.images,
    datasheetPath: row.datasheet_path,
    specGrid: toSpecGrid(row.spec_models, row.spec_properties, values),
    applications,
  };
}

// Applications ----------------------------------------------------------------

type ApplicationRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  body: string;
  image_path: string | null;
};

const APPLICATION_COLUMNS = "id, slug, name, summary, body, image_path";

function toApplication(row: ApplicationRow): Application {
  return {
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    body: row.body,
    imagePath: row.image_path,
  };
}

export async function getApplications(): Promise<Application[]> {
  const rows = await readRows<ApplicationRow>(
    getPublicClient()
      .from("applications")
      .select(APPLICATION_COLUMNS)
      .eq("published", true)
      .order("sort_order")
      .order("name"),
    "applications",
  );
  return rows.map(toApplication);
}

export async function getApplication(
  slug: string,
): Promise<(Application & { products: ProductSummary[] }) | null> {
  const application = await readRow<ApplicationRow>(
    getPublicClient()
      .from("applications")
      .select(APPLICATION_COLUMNS)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle(),
    `application ${slug}`,
  );
  if (!application) return null;

  const products = await readRows<ProductSummaryRow & { categories: CategoryRef }>(
    listedProducts(", product_applications!inner(application_id)")
      .eq("product_applications.application_id", application.id)
      .order("sort_order")
      .order("name"),
    `products of application ${slug}`,
  );
  return {
    ...toApplication(application),
    products: products.map((p) => toProductSummary(p, p.categories.slug)),
  };
}

// Certifications and projects ---------------------------------------------------

type CertificationRow = {
  id: string;
  name: string;
  issuer: string;
  valid_until: string | null;
  file_path: string | null;
  image_path: string | null;
};

export async function getCertifications(): Promise<Certification[]> {
  const rows = await readRows<CertificationRow>(
    getPublicClient()
      .from("certifications")
      .select("id, name, issuer, valid_until, file_path, image_path")
      .eq("published", true)
      .order("sort_order")
      .order("name"),
    "certifications",
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    validUntil: row.valid_until,
    filePath: row.file_path,
    imagePath: row.image_path,
  }));
}

type ProjectRow = {
  slug: string;
  title: string;
  location: string;
  country: Country;
  summary: string;
  body: string;
  images: string[];
  project_products: { products: EmbeddedProduct | null }[];
};

const PROJECT_COLUMNS = `
  slug, title, location, country, summary, body, images,
  project_products(products(${EMBEDDED_PRODUCT_COLUMNS}))
`;

function toProject(row: ProjectRow): Project {
  return {
    slug: row.slug,
    title: row.title,
    location: row.location,
    country: row.country,
    summary: row.summary,
    body: row.body,
    images: row.images,
    coverImage: row.images[0] ?? null,
    products: listedSummaries(row.project_products.map((link) => link.products)),
  };
}

export async function getProjects(): Promise<Project[]> {
  const rows = await readRows<ProjectRow>(
    getPublicClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("published", true)
      .order("sort_order")
      .order("title"),
    "projects",
  );
  return rows.map(toProject);
}

export async function getProject(slug: string): Promise<Project | null> {
  const row = await readRow<ProjectRow>(
    getPublicClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle(),
    `project ${slug}`,
  );
  return row ? toProject(row) : null;
}

// Site settings and navigation ----------------------------------------------------

type SiteSettingsRow = {
  tagline: string;
  hero_title: string;
  hero_text: string;
  about_md: string;
  india_address: string;
  india_phone: string;
  india_whatsapp: string;
  india_email: string;
  uae_address: string;
  uae_phone: string;
  uae_whatsapp: string;
  uae_email: string;
};

const EMPTY_SETTINGS: SiteSettings = {
  tagline: "",
  heroTitle: "",
  heroText: "",
  aboutMd: "",
  indiaAddress: "",
  indiaPhone: "",
  indiaWhatsapp: "",
  indiaEmail: "",
  uaeAddress: "",
  uaePhone: "",
  uaeWhatsapp: "",
  uaeEmail: "",
};

/** The site-wide settings. The row always exists (the migration creates it); if it is somehow gone, every field is empty. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const row = await readRow<SiteSettingsRow>(
    getPublicClient()
      .from("site_settings")
      .select(
        "tagline, hero_title, hero_text, about_md, india_address, india_phone, india_whatsapp, india_email, uae_address, uae_phone, uae_whatsapp, uae_email",
      )
      .eq("id", 1)
      .maybeSingle(),
    "site settings",
  );
  if (!row) return EMPTY_SETTINGS;
  return {
    tagline: row.tagline,
    heroTitle: row.hero_title,
    heroText: row.hero_text,
    aboutMd: row.about_md,
    indiaAddress: row.india_address,
    indiaPhone: row.india_phone,
    indiaWhatsapp: row.india_whatsapp,
    indiaEmail: row.india_email,
    uaeAddress: row.uae_address,
    uaePhone: row.uae_phone,
    uaeWhatsapp: row.uae_whatsapp,
    uaeEmail: row.uae_email,
  };
}

async function hasPublished(table: "certifications" | "projects"): Promise<boolean> {
  const { count, error } = await getPublicClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("published", true);
  if (error) throw new Error(`Could not check ${table}: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Which optional sections have content; the others are hidden from the nav and 404. */
export async function getNavVisibility(): Promise<{ certifications: boolean; projects: boolean }> {
  const [certifications, projects] = await Promise.all([
    hasPublished("certifications"),
    hasPublished("projects"),
  ]);
  return { certifications, projects };
}

// Lists for forms and the sitemap --------------------------------------------------

/**
 * Listed products (published, in a published category), grouped by category order, then product
 * order, each with its category. The quote form offers the categories that have at least one.
 */
export async function getProductOptions(): Promise<{ slug: string; name: string; category: { slug: string; name: string } }[]> {
  const rows = await readRows<{
    slug: string;
    name: string;
    sort_order: number;
    categories: { slug: string; name: string; sort_order: number };
  }>(
    getPublicClient()
      .from("products")
      .select("slug, name, sort_order, categories!inner(slug, name, published, sort_order)")
      .eq("published", true)
      .eq("categories.published", true),
    "product options",
  );
  return rows
    .sort(
      (a, b) =>
        a.categories.sort_order - b.categories.sort_order || bySortOrderThenName(a, b),
    )
    .map((row) => ({ slug: row.slug, name: row.name, category: { slug: row.categories.slug, name: row.categories.name } }));
}

/** The categories among these product options, once each, in the options' (category) order. */
export function categoryOptions(products: { category: { slug: string; name: string } }[]): { slug: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const { category } of products) if (!seen.has(category.slug)) seen.set(category.slug, category.name);
  return [...seen].map(([slug, name]) => ({ slug, name }));
}

type Dated = { slug: string; updated_at: string };

/**
 * Every public page, with its last change: the fixed pages, plus one entry per
 * published category, product (in a published category), application and project.
 * `/certifications` and `/projects` appear only when they have published entries.
 * Paths are relative ("/products/geogrid"); the sitemap adds the site URL.
 */
export async function getSitemapEntries(): Promise<{ path: string; updatedAt: string }[]> {
  const db = getPublicClient();
  const [settings, categories, products, applications, certifications, projects] =
    await Promise.all([
      readRow<{ updated_at: string }>(
        db.from("site_settings").select("updated_at").eq("id", 1).maybeSingle(),
        "site settings",
      ),
      readRows<Dated>(
        db.from("categories").select("slug, updated_at").eq("published", true),
        "categories",
      ),
      readRows<Dated & { categories: { slug: string } }>(
        db
          .from("products")
          .select("slug, updated_at, categories!inner(slug, published)")
          .eq("published", true)
          .eq("categories.published", true),
        "products",
      ),
      readRows<Dated>(
        db.from("applications").select("slug, updated_at").eq("published", true),
        "applications",
      ),
      readRows<{ updated_at: string }>(
        db.from("certifications").select("updated_at").eq("published", true),
        "certifications",
      ),
      readRows<Dated>(
        db.from("projects").select("slug, updated_at").eq("published", true),
        "projects",
      ),
    ]);

  const siteUpdated = latest(settings ? [settings.updated_at] : [], new Date().toISOString());
  const stamps = (rows: { updated_at: string }[]) => rows.map((r) => r.updated_at);

  const entries: { path: string; updatedAt: string }[] = [
    { path: "/", updatedAt: siteUpdated },
    {
      path: "/products",
      updatedAt: latest([...stamps(categories), ...stamps(products)], siteUpdated),
    },
    { path: "/applications", updatedAt: latest(stamps(applications), siteUpdated) },
    { path: "/about", updatedAt: siteUpdated },
    { path: "/contact", updatedAt: siteUpdated },
    { path: "/quote", updatedAt: siteUpdated },
  ];
  if (certifications.length > 0) {
    entries.push({ path: "/certifications", updatedAt: latest(stamps(certifications), siteUpdated) });
  }
  if (projects.length > 0) {
    entries.push({ path: "/projects", updatedAt: latest(stamps(projects), siteUpdated) });
  }

  for (const c of categories) {
    entries.push({ path: `/products/${c.slug}`, updatedAt: toIso(c.updated_at) });
  }
  for (const p of products) {
    entries.push({
      path: `/products/${p.categories.slug}/${p.slug}`,
      updatedAt: toIso(p.updated_at),
    });
  }
  for (const a of applications) {
    entries.push({ path: `/applications/${a.slug}`, updatedAt: toIso(a.updated_at) });
  }
  for (const p of projects) {
    entries.push({ path: `/projects/${p.slug}`, updatedAt: toIso(p.updated_at) });
  }
  return entries;
}
