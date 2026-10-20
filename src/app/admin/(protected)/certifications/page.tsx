import type { Metadata } from "next";
import Link from "next/link";
import { EntityTable } from "@/components/admin/EntityTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin/require-admin";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certifications" };

export default async function CertificationsPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("certifications")
    .select("id, name, issuer, valid_until, sort_order, published")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load certifications: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Certifications"
        intro="Quality certificates and approvals. The Certifications page on the website appears once one is published."
        action={
          <Link href="/admin/certifications/new" className="btn btn-primary">
            New certification
          </Link>
        }
      />
      <div className="mt-8">
        <EntityTable
          caption="Certifications"
          rows={data ?? []}
          editHref={(row) => `/admin/certifications/${row.id}`}
          columns={[
            { header: "Name", cell: (row) => row.name },
            { header: "Issuer", cell: (row) => row.issuer || "–", hideOnMobile: true },
            { header: "Valid until", cell: (row) => (row.valid_until ? formatDate(row.valid_until) : "–"), hideOnMobile: true },
          ]}
          emptyMessage="There are no certifications yet. Add the first one."
        />
      </div>
    </>
  );
}
