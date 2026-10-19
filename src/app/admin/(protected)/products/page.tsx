import type { Metadata } from "next";
import Link from "next/link";
import { EntityTable } from "@/components/admin/EntityTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Products" };

type ProductListRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  published: boolean;
  categories: { name: string; published: boolean } | null;
};

export default async function ProductsPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, sort_order, published, categories(name, published)")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const products = (data ?? []) as unknown as ProductListRow[];

  return (
    <>
      <PageHeader
        title="Products"
        intro="The catalogue. A product appears on the website when it is published and its category is published too."
        action={
          <Link href="/admin/products/new" className="btn btn-primary">
            New product
          </Link>
        }
      />
      <div className="mt-8">
        <EntityTable
          caption="Products"
          rows={products}
          editHref={(row) => `/admin/products/${row.id}`}
          columns={[
            { header: "Name", cell: (row) => row.name },
            {
              header: "Category",
              cell: (row) =>
                row.categories ? `${row.categories.name}${row.categories.published ? "" : " (draft category)"}` : "–",
            },
            { header: "Slug", cell: (row) => row.slug, hideOnMobile: true },
          ]}
          emptyMessage="There are no products yet. Add the first one."
        />
      </div>
    </>
  );
}
