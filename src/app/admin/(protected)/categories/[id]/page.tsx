import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { MediaUpload } from "@/components/admin/MediaUpload";
import { PageHeader } from "@/components/admin/PageHeader";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { IMAGE_ACCEPT } from "@/lib/admin/upload";
import { deleteCategory, saveCategory } from "../actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New category" : "Edit category" };
}

export default async function CategoryPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  let category: {
    id: string;
    slug: string;
    name: string;
    intro: string;
    image_path: string | null;
    sort_order: number;
    published: boolean;
    updated_at: string;
  } | null = null;

  if (id !== "new") {
    if (!UUID_PATTERN.test(id)) notFound();
    const { data, error } = await supabase
      .from("categories")
      .select("id, slug, name, intro, image_path, sort_order, published, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Could not load the category: ${error.message}`);
    if (!data) notFound();
    category = data;
  }

  return (
    <>
      <Link href="/admin/categories" className="text-sm font-semibold text-navy underline underline-offset-4">
        All categories
      </Link>
      <div className="mt-3">
        <PageHeader title={category ? "Edit category" : "New category"} />
      </div>

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveCategory} id={category?.id} listHref="/admin/categories">
          {/* Keyed by the last save, so the fields show what was stored (a slug made from the name, say). */}
          <div key={category?.updated_at ?? "new"} className="space-y-6">
            <Field label="Name" name="name" required maxLength={120} defaultValue={category?.name} />
            <Field
              label="URL slug"
              name="slug"
              maxLength={100}
              spellCheck={false}
              defaultValue={category?.slug}
              hint="Used in the page address, for example geogrid. Leave blank to make it from the name."
            />
            <Field
              label="Intro"
              name="intro"
              type="textarea"
              rows={5}
              maxLength={2000}
              defaultValue={category?.intro}
              hint="A short description shown at the top of the category page."
            />
            <MediaUpload
              bucket="public-media"
              folder="categories"
              name="image_path"
              label="Image"
              accept={IMAGE_ACCEPT}
              value={category?.image_path ?? null}
              hint="PNG, JPEG or WebP, up to 10 MB."
            />
            <Field
              label="Sort order"
              name="sort_order"
              inputMode="numeric"
              defaultValue={category?.sort_order ?? 0}
              hint="Lower numbers come first."
            />
            <PublishedToggle defaultChecked={category?.published ?? false} />
          </div>
        </EntityForm>

        {category ? (
          <DeleteButton
            id={category.id}
            name={category.name}
            noun="category"
            action={deleteCategory}
            listHref="/admin/categories"
          />
        ) : null}
      </div>
    </>
  );
}
