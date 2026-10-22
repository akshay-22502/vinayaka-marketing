import type { Metadata } from "next";
import Link from "next/link";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { NoteDeleteButton } from "@/components/admin/NoteDeleteButton";
import { PageHeader } from "@/components/admin/PageHeader";
import type { CategoryRow } from "@/lib/admin/documents";
import { requireAdmin } from "@/lib/admin/require-admin";
import { deleteDocumentCategory, saveDocumentCategory } from "./actions";

export const metadata: Metadata = { title: "Document categories" };

const LIST_HREF = "/admin/document-categories";
const editToggle =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-navy hover:bg-slate-100";

function CategoryFields({ category }: { category: CategoryRow | null }) {
  return (
    <div className="space-y-6">
      <Field label="Name" name="name" required maxLength={80} defaultValue={category?.name} hint="For example Supplier invoice or Bill of entry." />
      <Field
        label="Order in the list"
        name="sort_order"
        inputMode="numeric"
        maxLength={7}
        defaultValue={category?.sort_order ?? ""}
        hint="Smaller numbers come first. Leave empty for 0."
      />
    </div>
  );
}

export default async function DocumentCategoriesPage() {
  const { supabase } = await requireAdmin();
  const [categoriesResult, countsResult] = await Promise.all([
    supabase.from("document_categories").select("id, name, sort_order").order("sort_order").order("name"),
    supabase.from("purchase_documents").select("category_id"),
  ]);
  if (categoriesResult.error) throw new Error(`Could not load the document categories: ${categoriesResult.error.message}`);
  if (countsResult.error) throw new Error(`Could not count the documents: ${countsResult.error.message}`);
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const counts = new Map<string, number>();
  for (const row of (countsResult.data ?? []) as { category_id: string | null }[]) {
    if (row.category_id) counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  return (
    <>
      <Link href="/admin/purchases" className="text-sm font-semibold text-navy underline underline-offset-4">
        All purchases
      </Link>
      <div className="mt-3">
        <PageHeader title="Document categories" intro="The folders a purchase's documents are filed under: invoices, packing lists, customs papers, bills." />
      </div>

      <section aria-labelledby="categories-heading" className="mt-8 max-w-2xl">
        <h2 id="categories-heading" className="text-lg font-semibold text-navy">
          Categories
        </h2>
        {categories.length === 0 ? (
          <p className="mt-3 text-slate-600">No categories yet. Add one below.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {categories.map((category) => {
              const count = counts.get(category.id) ?? 0;
              return (
                <li key={category.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="font-semibold text-slate-900">{category.name}</p>
                      <p className="text-sm text-slate-600">
                        {count === 1 ? "1 document" : `${count} documents`} · order {category.sort_order}
                      </p>
                    </div>
                    <NoteDeleteButton id={category.id} action={deleteDocumentCategory} noun="category" />
                  </div>
                  {count > 0 ? <p className="mt-1 text-sm text-slate-600">Deleting it keeps its documents, without a category.</p> : null}
                  <details className="mt-2">
                    <summary className={editToggle}>Rename or reorder</summary>
                    <div className="mt-3">
                      <EntityForm key={`${category.name}-${category.sort_order}`} action={saveDocumentCategory} id={category.id} listHref={LIST_HREF}>
                        <CategoryFields category={category} />
                      </EntityForm>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 id="add-category-heading" className="font-semibold text-slate-900">
            Add a category
          </h3>
          <div className="mt-4" role="region" aria-labelledby="add-category-heading">
            <EntityForm key={`new-${categories.length}-${categories.at(-1)?.id ?? "none"}`} action={saveDocumentCategory} listHref={LIST_HREF} submitLabel="Add category">
              <CategoryFields category={null} />
            </EntityForm>
          </div>
        </div>
      </section>
    </>
  );
}
