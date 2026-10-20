import type { Metadata } from "next";
import Link from "next/link";
import { EntityTable } from "@/components/admin/EntityTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin/require-admin";
import { countryName } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, title, location, country, sort_order, published")
    .order("sort_order")
    .order("title");
  if (error) throw new Error(`Could not load projects: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Projects"
        intro="Projects where the products were supplied. The Projects page on the website appears once one is published."
        action={
          <Link href="/admin/projects/new" className="btn btn-primary">
            New project
          </Link>
        }
      />
      <div className="mt-8">
        <EntityTable
          caption="Projects"
          rows={data ?? []}
          editHref={(row) => `/admin/projects/${row.id}`}
          columns={[
            { header: "Title", cell: (row) => row.title },
            { header: "Country", cell: (row) => countryName(row.country) },
            { header: "Location", cell: (row) => row.location || "–", hideOnMobile: true },
          ]}
          emptyMessage="There are no projects yet. Add the first one."
        />
      </div>
    </>
  );
}
