import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckboxGroup } from "@/components/admin/CheckboxGroup";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { ImagesField } from "@/components/admin/ImagesField";
import { MarkdownField } from "@/components/admin/MarkdownField";
import { MediaUpload } from "@/components/admin/MediaUpload";
import { PageHeader } from "@/components/admin/PageHeader";
import { PublishConfirm } from "@/components/admin/PublishConfirm";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { SpecGridEditor } from "@/components/admin/SpecGridEditor";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { PDF_ACCEPT } from "@/lib/admin/upload";
import { toSpecGrid } from "@/lib/content/spec-grid";
import type { SpecGrid } from "@/lib/content/types";
import { deleteProduct, saveProduct, saveSpecGrid } from "../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
};

type ProductRow = {
  id: string;
  slug: string;
  category_id: string;
  name: string;
  summary: string;
  overview: string;
  features: string[];
  images: string[];
  datasheet_path: string | null;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

type SpecPropertyRow = {
  id: string;
  name: string;
  unit: string | null;
  test_method: string | null;
  sort_order: number;
  spec_values: { property_id: string; model_id: string; value: string | null }[];
};

const draft = (published: boolean) => (published ? "" : " (draft)");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New product" : "Edit product" };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;

  let product: ProductRow | null = null;
  let linkedApplicationIds: string[] = [];
  let specGrid: SpecGrid = { models: [], rows: [] };

  if (id !== "new") {
    if (!UUID_PATTERN.test(id)) notFound();
    const [productResult, linksResult, modelsResult, propertiesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, slug, category_id, name, summary, overview, features, images, datasheet_path, sort_order, published, updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("product_applications").select("application_id").eq("product_id", id),
      supabase.from("spec_models").select("id, code, sort_order").eq("product_id", id),
      supabase
        .from("spec_properties")
        .select("id, name, unit, test_method, sort_order, spec_values(property_id, model_id, value)")
        .eq("product_id", id),
    ]);
    if (productResult.error) throw new Error(`Could not load the product: ${productResult.error.message}`);
    if (linksResult.error) throw new Error(`Could not load the product's applications: ${linksResult.error.message}`);
    if (modelsResult.error) throw new Error(`Could not load the spec table: ${modelsResult.error.message}`);
    if (propertiesResult.error) throw new Error(`Could not load the spec table: ${propertiesResult.error.message}`);
    if (!productResult.data) notFound();

    product = productResult.data as ProductRow;
    linkedApplicationIds = linksResult.data.map((link) => link.application_id as string);
    const properties = (propertiesResult.data ?? []) as unknown as SpecPropertyRow[];
    specGrid = toSpecGrid(
      modelsResult.data ?? [],
      properties,
      properties.flatMap((property) => property.spec_values),
    );
  }

  // Every category and every application, published or not, so a product can be prepared before they go live.
  const [categoriesResult, applicationsResult] = await Promise.all([
    supabase.from("categories").select("id, name, published").order("sort_order").order("name"),
    supabase.from("applications").select("id, name, published").order("sort_order").order("name"),
  ]);
  if (categoriesResult.error) throw new Error(`Could not load categories: ${categoriesResult.error.message}`);
  if (applicationsResult.error) throw new Error(`Could not load applications: ${applicationsResult.error.message}`);

  const categoryOptions = [
    { value: "", label: "Choose a category" },
    ...(categoriesResult.data ?? []).map((category) => ({
      value: category.id as string,
      label: `${category.name}${draft(category.published as boolean)}`,
    })),
  ];
  const applicationOptions = (applicationsResult.data ?? []).map((application) => ({
    value: application.id as string,
    label: `${application.name}${draft(application.published as boolean)}`,
  }));

  return (
    <>
      <Link href="/admin/products" className="text-sm font-semibold text-navy underline underline-offset-4">
        All products
      </Link>
      <div className="mt-3">
        <PageHeader title={product ? "Edit product" : "New product"} />
      </div>

      {product && created === "1" ? (
        <p role="status" className="mt-6 max-w-2xl rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">
          Product created. Add its specification table below, then check it on the website.
        </p>
      ) : null}
      {product ? (
        <p className="mt-4 text-sm">
          <a href="#spec-heading" className="font-semibold text-navy underline underline-offset-4">
            Go to the specification table
          </a>
        </p>
      ) : null}

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveProduct} id={product?.id} listHref="/admin/products">
          <div key={product?.updated_at ?? "new"} className="space-y-6">
            <Field label="Name" name="name" required maxLength={200} defaultValue={product?.name} />
            <Field
              label="URL slug"
              name="slug"
              maxLength={100}
              spellCheck={false}
              defaultValue={product?.slug}
              hint="Used in the page address, for example pp-biaxial-geogrid. Leave blank to make it from the name. Every product needs its own."
            />
            <Field
              label="Category"
              name="category_id"
              type="select"
              required
              options={categoryOptions}
              defaultValue={product?.category_id ?? ""}
              hint="A product shows on the website only while its category is published too."
            />
            <Field
              label="Summary"
              name="summary"
              type="textarea"
              rows={3}
              maxLength={500}
              defaultValue={product?.summary}
              hint="One or two sentences, shown on the product cards."
            />
            <MarkdownField
              label="Overview (Markdown)"
              name="overview"
              previewLabel="Preview of the overview"
              rows={12}
              maxLength={20000}
              defaultValue={product?.overview}
              hint="Markdown: ## Heading, **bold**, - list item. Raw HTML is not shown. Use Preview to see how it will look."
            />
            <Field
              label="Features (one per line)"
              name="features"
              type="textarea"
              rows={6}
              defaultValue={product?.features.join("\n")}
              hint="Each line becomes one bullet on the product page."
            />
            <ImagesField folder="products" initial={product?.images ?? []} />
            <MediaUpload
              bucket="public-media"
              folder="products"
              name="datasheet_path"
              label="Datasheet (PDF)"
              accept={PDF_ACCEPT}
              value={product?.datasheet_path ?? null}
              hint="Offered as a download on the product page."
            />
            <CheckboxGroup
              legend="Applications"
              name="application_ids"
              options={applicationOptions}
              selected={linkedApplicationIds}
              hint="Where this product is used. Applications that are not published yet are marked (draft) and stay hidden until they are."
              emptyMessage="There are no applications yet."
            />
            <Field
              label="Sort order"
              name="sort_order"
              inputMode="numeric"
              defaultValue={product?.sort_order ?? 0}
              hint="Lower numbers come first."
            />
            <PublishedToggle defaultChecked={product?.published ?? false} />
            <PublishConfirm />
          </div>
        </EntityForm>
      </div>

      <section aria-labelledby="spec-heading" className="mt-14 border-t border-slate-200 pt-8">
        <h2 id="spec-heading" className="text-xl font-bold tracking-tight text-navy sm:text-2xl">
          Specification table
        </h2>
        {product ? (
          <>
            <p className="mt-1 max-w-3xl text-slate-600">
              Edited and saved on its own, separately from the details above: use its own Save button. The whole table is saved
              at once, so either every change is stored or none.
            </p>
            <div className="mt-6">
              <SpecGridEditor initial={specGrid} onSave={saveSpecGrid.bind(null, product.id)} />
            </div>
          </>
        ) : (
          <p className="mt-2 max-w-3xl text-slate-600">
            Save the product first. Its specification table (models as columns, properties as rows) is added on the next screen.
          </p>
        )}
      </section>

      {product ? (
        <DeleteButton id={product.id} name={product.name} noun="product" action={deleteProduct} listHref="/admin/products" />
      ) : null}
    </>
  );
}
