import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckboxGroup } from "@/components/admin/CheckboxGroup";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { ImagesField } from "@/components/admin/ImagesField";
import { PageHeader } from "@/components/admin/PageHeader";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { deleteProject, saveProject } from "../actions";

type Props = { params: Promise<{ id: string }> };

type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  location: string;
  country: "IN" | "AE";
  summary: string;
  body: string;
  images: string[];
  sort_order: number;
  published: boolean;
  updated_at: string;
};

type ProductRow = { id: string; name: string; published: boolean; categories: { name: string } | null };

const COUNTRY_OPTIONS = [
  { value: "", label: "Choose a country" },
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates (UAE)" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New project" : "Edit project" };
}

export default async function ProjectPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  let project: ProjectRow | null = null;
  let linkedProductIds: string[] = [];

  if (id !== "new") {
    if (!UUID_PATTERN.test(id)) notFound();
    const [projectResult, linksResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id, slug, title, location, country, summary, body, images, sort_order, published, updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("project_products").select("product_id").eq("project_id", id),
    ]);
    if (projectResult.error) throw new Error(`Could not load the project: ${projectResult.error.message}`);
    if (linksResult.error) throw new Error(`Could not load the project's products: ${linksResult.error.message}`);
    if (!projectResult.data) notFound();
    project = projectResult.data as ProjectRow;
    linkedProductIds = linksResult.data.map((link) => link.product_id as string);
  }

  // Every product, published or not, so a project can be prepared before its products go live.
  const productsResult = await supabase.from("products").select("id, name, published, categories(name)").order("name");
  if (productsResult.error) throw new Error(`Could not load products: ${productsResult.error.message}`);
  const products = (productsResult.data ?? []) as unknown as ProductRow[];
  const productOptions = products
    .map((product) => ({
      value: product.id,
      category: product.categories?.name ?? "",
      label: `${product.name} · ${product.categories?.name ?? "No category"}${product.published ? "" : " (draft)"}`,
      name: product.name,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(({ value, label }) => ({ value, label }));

  return (
    <>
      <Link href="/admin/projects" className="text-sm font-semibold text-navy underline underline-offset-4">
        All projects
      </Link>
      <div className="mt-3">
        <PageHeader title={project ? "Edit project" : "New project"} />
      </div>

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveProject} id={project?.id} listHref="/admin/projects">
          <div key={project?.updated_at ?? "new"} className="space-y-6">
            <Field label="Title" name="title" required maxLength={200} defaultValue={project?.title} />
            <Field
              label="URL slug"
              name="slug"
              maxLength={100}
              spellCheck={false}
              defaultValue={project?.slug}
              hint="Used in the page address. Leave blank to make it from the title."
            />
            <Field label="Country" name="country" type="select" required options={COUNTRY_OPTIONS} defaultValue={project?.country ?? ""} />
            <Field label="Location" name="location" maxLength={200} defaultValue={project?.location} hint="City or site, for example Pune." />
            <Field
              label="Summary"
              name="summary"
              type="textarea"
              rows={3}
              maxLength={500}
              defaultValue={project?.summary}
              hint="One or two sentences, shown on the card."
            />
            <Field
              label="Details (Markdown)"
              name="body"
              type="textarea"
              rows={12}
              maxLength={20000}
              spellCheck
              defaultValue={project?.body}
              hint="Markdown: ## Heading, **bold**, - list item. Raw HTML is not shown."
            />
            <ImagesField folder="projects" initial={project?.images ?? []} />
            <CheckboxGroup
              legend="Products used"
              name="product_ids"
              options={productOptions}
              selected={linkedProductIds}
              hint="Shown on the project page. Products that are not published yet are marked (draft) and stay hidden until they are."
              emptyMessage="There are no products yet."
            />
            <Field
              label="Sort order"
              name="sort_order"
              inputMode="numeric"
              defaultValue={project?.sort_order ?? 0}
              hint="Lower numbers come first."
            />
            <PublishedToggle defaultChecked={project?.published ?? false} />
          </div>
        </EntityForm>

        {project ? (
          <DeleteButton id={project.id} name={project.title} noun="project" action={deleteProject} listHref="/admin/projects" />
        ) : null}
      </div>
    </>
  );
}
