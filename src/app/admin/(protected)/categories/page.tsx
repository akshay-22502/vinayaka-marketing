import type { Metadata } from "next";
import Link from "next/link";
import { EntityTable } from "@/components/admin/EntityTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, sort_order, published")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);

  return (
    <>
      <PageHeader
        title="Categories"
        intro="The product ranges on the website, such as Geogrid and Geomembrane."
        action={
          <Link href="/admin/categories/new" className="btn btn-primary">
            New category
          </Link>
        }
      />
      <div className="mt-8">
        <EntityTable
          caption="Categories"
          rows={data ?? []}
          editHref={(row) => `/admin/categories/${row.id}`}
          columns={[
            { header: "Name", cell: (row) => row.name },
            { header: "URL slug", cell: (row) => row.slug, hideOnMobile: true },
          ]}
          emptyMessage="There are no categories yet. Add the first one."
        />
      </div>
    </>
  );
}
