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
import { deleteApplication, saveApplication } from "../actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New application" : "Edit application" };
}

export default async function ApplicationPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  let application: {
    id: string;
    slug: string;
    name: string;
    summary: string;
    body: string;
    image_path: string | null;
    sort_order: number;
    published: boolean;
    updated_at: string;
  } | null = null;

  if (id !== "new") {
    if (!UUID_PATTERN.test(id)) notFound();
    const { data, error } = await supabase
      .from("applications")
      .select("id, slug, name, summary, body, image_path, sort_order, published, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Could not load the application: ${error.message}`);
    if (!data) notFound();
    application = data;
  }

  return (
    <>
      <Link href="/admin/applications" className="text-sm font-semibold text-navy underline underline-offset-4">
        All applications
      </Link>
      <div className="mt-3">
        <PageHeader title={application ? "Edit application" : "New application"} />
      </div>

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveApplication} id={application?.id} listHref="/admin/applications">
          <div key={application?.updated_at ?? "new"} className="space-y-6">
            <Field label="Name" name="name" required maxLength={120} defaultValue={application?.name} />
            <Field
              label="URL slug"
              name="slug"
              maxLength={100}
              spellCheck={false}
              defaultValue={application?.slug}
              hint="Used in the page address, for example roads-and-pavements. Leave blank to make it from the name."
            />
            <Field
              label="Summary"
              name="summary"
              type="textarea"
              rows={3}
              maxLength={500}
              defaultValue={application?.summary}
              hint="One or two sentences, shown on the card."
            />
            <Field
              label="Details (Markdown)"
              name="body"
              type="textarea"
              rows={14}
              maxLength={20000}
              spellCheck
              defaultValue={application?.body}
              hint="Markdown: ## Heading, **bold**, - list item. Raw HTML is not shown."
            />
            <MediaUpload
              bucket="public-media"
              folder="applications"
              name="image_path"
              label="Image"
              accept={IMAGE_ACCEPT}
              value={application?.image_path ?? null}
              hint="PNG, JPEG or WebP, up to 10 MB."
            />
            <Field
              label="Sort order"
              name="sort_order"
              inputMode="numeric"
              defaultValue={application?.sort_order ?? 0}
              hint="Lower numbers come first."
            />
            <PublishedToggle defaultChecked={application?.published ?? false} />
          </div>
        </EntityForm>

        {application ? (
          <DeleteButton
            id={application.id}
            name={application.name}
            noun="application"
            action={deleteApplication}
            listHref="/admin/applications"
          />
        ) : null}
      </div>
    </>
  );
}
