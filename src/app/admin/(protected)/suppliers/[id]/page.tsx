import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { PageHeader } from "@/components/admin/PageHeader";
import { PurchaseTable } from "@/components/admin/PurchaseTable";
import { websiteHref } from "@/lib/admin/buyers";
import { PURCHASE_LIST_COLUMNS, withSums, type PurchaseListRow } from "@/lib/admin/purchase-list";
import { safeMailto } from "@/lib/admin/quote-view";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { telHref, whatsappHref } from "@/lib/contact";
import { deleteSupplier, saveSupplier } from "../actions";

type Props = { params: Promise<{ id: string }> };

type SupplierRow = {
  id: string;
  name: string;
  country: string;
  location: string;
  contact_person: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  makes: string;
  payment_terms: string;
  notes: string;
  updated_at: string;
};

const COLUMNS = "id, name, country, location, contact_person, phone, mobile, email, website, makes, payment_terms, notes, updated_at";

const contactLink =
  "inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-navy hover:bg-slate-50";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New supplier" : "Supplier" };
}

/** The details form, shared by "New supplier" and an existing supplier. */
function SupplierFields({ supplier }: { supplier: SupplierRow | null }) {
  return (
    <div key={supplier?.updated_at ?? "new"} className="space-y-6">
      <Field label="Company" name="name" required maxLength={200} defaultValue={supplier?.name} />
      <Field label="Country" name="country" maxLength={100} defaultValue={supplier?.country ?? "China"} />
      <Field label="City / province" name="location" maxLength={200} defaultValue={supplier?.location} hint="For example Tai'an, Shandong." />
      <Field
        label="What they make"
        name="makes"
        type="textarea"
        rows={3}
        maxLength={1000}
        defaultValue={supplier?.makes}
        hint="For example HDPE geomembrane, PP biaxial geogrid."
      />
      <Field label="Contact person" name="contact_person" maxLength={200} defaultValue={supplier?.contact_person} />
      <Field label="Phone" name="phone" type="tel" inputMode="tel" maxLength={100} defaultValue={supplier?.phone} />
      <Field
        label="Mobile / WhatsApp / WeChat"
        name="mobile"
        type="tel"
        inputMode="tel"
        maxLength={100}
        defaultValue={supplier?.mobile}
        hint="With the country code, for example +86 138 0000 0000."
      />
      <Field label="Email" name="email" type="email" inputMode="email" maxLength={200} defaultValue={supplier?.email} />
      <Field label="Website" name="website" maxLength={300} spellCheck={false} defaultValue={supplier?.website} />
      <Field
        label="Payment terms"
        name="payment_terms"
        maxLength={300}
        defaultValue={supplier?.payment_terms}
        hint="For example 30% advance, 70% against copy of B/L."
      />
      <Field label="Notes" name="notes" type="textarea" rows={4} maxLength={5000} spellCheck defaultValue={supplier?.notes} />
    </div>
  );
}

export default async function SupplierPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  if (id === "new") {
    return (
      <>
        <Link href="/admin/suppliers" className="text-sm font-semibold text-navy underline underline-offset-4">
          All suppliers
        </Link>
        <div className="mt-3">
          <PageHeader title="New supplier" intro="After saving you can add purchases from this supplier." />
        </div>
        <div className="mt-8 max-w-2xl">
          <EntityForm action={saveSupplier} listHref="/admin/suppliers">
            <SupplierFields supplier={null} />
          </EntityForm>
        </div>
      </>
    );
  }

  if (!UUID_PATTERN.test(id)) notFound();
  const [supplierResult, purchasesResult] = await Promise.all([
    supabase.from("suppliers").select(COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("purchases")
      .select(PURCHASE_LIST_COLUMNS)
      .eq("supplier_id", id)
      .order("order_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);
  if (supplierResult.error) throw new Error(`Could not load the supplier: ${supplierResult.error.message}`);
  if (purchasesResult.error) throw new Error(`Could not load the supplier's purchases: ${purchasesResult.error.message}`);
  if (!supplierResult.data) notFound();
  const supplier = supplierResult.data as SupplierRow;
  const purchases = await withSums(supabase, (purchasesResult.data ?? []) as unknown as PurchaseListRow[]);

  const call = telHref(supplier.mobile) ?? telHref(supplier.phone);
  const whatsapp = whatsappHref(supplier.mobile);
  const mailto = safeMailto(supplier.email);
  const website = websiteHref(supplier.website);
  const place = [supplier.location, supplier.country].filter(Boolean).join(", ");

  // Everything here is shown as plain text by React (escaped); links are only made from values that passed a strict check.
  return (
    <>
      <Link href="/admin/suppliers" className="text-sm font-semibold text-navy underline underline-offset-4">
        All suppliers
      </Link>
      <div className="mt-3">
        <PageHeader
          title={supplier.name}
          intro={place}
          action={
            <Link href={`/admin/purchases/new?supplier=${supplier.id}`} className="btn btn-primary">
              New purchase
            </Link>
          }
        />
      </div>

      {call || whatsapp || mailto || website ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {call ? (
            <a href={call} className={contactLink}>
              Call
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={contactLink}>
              WhatsApp
            </a>
          ) : null}
          {mailto ? (
            <a href={mailto} className={contactLink}>
              Email
            </a>
          ) : null}
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" className={contactLink}>
              Website
            </a>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="purchases-heading" className="mt-8">
        <h2 id="purchases-heading" className="text-lg font-semibold text-navy">
          Purchases
        </h2>
        {purchases.length === 0 ? (
          <p className="mt-3 text-slate-600">No purchases from this supplier yet.</p>
        ) : (
          <PurchaseTable rows={purchases} caption={`Purchases from ${supplier.name}, newest first`} />
        )}
      </section>

      <section aria-labelledby="details-heading" className="mt-10 max-w-2xl">
        <h2 id="details-heading" className="text-lg font-semibold text-navy">
          Details
        </h2>
        <div className="mt-4">
          <EntityForm action={saveSupplier} id={supplier.id} listHref="/admin/suppliers">
            <SupplierFields supplier={supplier} />
          </EntityForm>
        </div>
        <DeleteButton id={supplier.id} name={supplier.name} noun="supplier" action={deleteSupplier} listHref="/admin/suppliers" />
      </section>
    </>
  );
}
