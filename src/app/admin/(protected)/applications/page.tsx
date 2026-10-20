import type { Metadata } from "next";
import Link from "next/link";
import { EntityTable } from "@/components/admin/EntityTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("applications")
    .select("id, slug, name, sort_order, published")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load applications: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Applications"
        intro="Where the products are used, such as roads, landfills and railways."
        action={
          <Link href="/admin/applications/new" className="btn btn-primary">
            New application
          </Link>
        }
      />
      <div className="mt-8">
        <EntityTable
          caption="Applications"
          rows={data ?? []}
          editHref={(row) => `/admin/applications/${row.id}`}
          columns={[
            { header: "Name", cell: (row) => row.name },
            { header: "URL slug", cell: (row) => row.slug, hideOnMobile: true },
          ]}
          emptyMessage="There are no applications yet. Add the first one."
        />
      </div>
    </>
  );
}
