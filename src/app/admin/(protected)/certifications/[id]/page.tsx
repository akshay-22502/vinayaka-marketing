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
import { IMAGE_ACCEPT, PDF_ACCEPT } from "@/lib/admin/upload";
import { deleteCertification, saveCertification } from "../actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New certification" : "Edit certification" };
}

export default async function CertificationPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  let certification: {
    id: string;
    name: string;
    issuer: string;
    valid_until: string | null;
    file_path: string | null;
    image_path: string | null;
    sort_order: number;
    published: boolean;
    updated_at: string;
  } | null = null;

  if (id !== "new") {
    if (!UUID_PATTERN.test(id)) notFound();
    const { data, error } = await supabase
      .from("certifications")
      .select("id, name, issuer, valid_until, file_path, image_path, sort_order, published, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Could not load the certification: ${error.message}`);
    if (!data) notFound();
    certification = data;
  }

  return (
    <>
      <Link href="/admin/certifications" className="text-sm font-semibold text-navy underline underline-offset-4">
        All certifications
      </Link>
      <div className="mt-3">
        <PageHeader title={certification ? "Edit certification" : "New certification"} />
      </div>

      <div className="mt-8 max-w-2xl">
        <EntityForm action={saveCertification} id={certification?.id} listHref="/admin/certifications">
          <div key={certification?.updated_at ?? "new"} className="space-y-6">
            <Field label="Name" name="name" required maxLength={200} defaultValue={certification?.name} hint="For example ISO 9001:2015." />
            <Field label="Issuer" name="issuer" maxLength={200} defaultValue={certification?.issuer} hint="The body that issued it." />
            <Field
              label="Valid until"
              name="valid_until"
              type="date"
              defaultValue={certification?.valid_until}
              hint="Leave blank if it does not expire."
            />
            <MediaUpload
              bucket="public-media"
              folder="certifications"
              name="file_path"
              label="Certificate PDF"
              accept={PDF_ACCEPT}
              value={certification?.file_path ?? null}
              hint="Visitors can open it from the Certifications page. PDF, up to 10 MB."
            />
            <MediaUpload
              bucket="public-media"
              folder="certifications"
              name="image_path"
              label="Certificate image"
              accept={IMAGE_ACCEPT}
              value={certification?.image_path ?? null}
              hint="A logo or a picture of the certificate. PNG, JPEG or WebP, up to 10 MB."
            />
            <Field
              label="Sort order"
              name="sort_order"
              inputMode="numeric"
              defaultValue={certification?.sort_order ?? 0}
              hint="Lower numbers come first."
            />
            <PublishedToggle defaultChecked={certification?.published ?? false} />
          </div>
        </EntityForm>

        {certification ? (
          <DeleteButton
            id={certification.id}
            name={certification.name}
            noun="certification"
            action={deleteCertification}
            listHref="/admin/certifications"
          />
        ) : null}
      </div>
    </>
  );
}
