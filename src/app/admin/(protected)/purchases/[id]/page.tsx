import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { NoteDeleteButton } from "@/components/admin/NoteDeleteButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { MediaUpload } from "@/components/admin/MediaUpload";
import { PurchaseStatusBadge } from "@/components/admin/PurchaseStatusBadge";
import {
  DOCUMENTS_BUCKET,
  DOCUMENT_LINK_SECONDS,
  documentFolder,
  groupDocuments,
  type CategoryRow,
  type DocumentRow,
} from "@/lib/admin/documents";
import {
  CONTAINER_TYPES,
  CONTAINER_TYPE_LABELS,
  COST_KINDS,
  COST_KIND_LABELS,
  PURCHASE_CURRENCIES,
  PURCHASE_CURRENCY_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  formatMoney,
  formatQuantity,
  localCurrency,
  purchaseSums,
  type ContainerType,
  type CostKind,
  type LineSums,
} from "@/lib/admin/purchases";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, displayName } from "@/lib/admin/upload";
import type { Country } from "@/lib/content/types";
import { countryName, formatDate } from "@/lib/format";
import {
  deletePurchase,
  deletePurchaseCost,
  deletePurchaseItem,
  savePurchase,
  savePurchaseCost,
  savePurchaseItem,
} from "../actions";
import { deletePurchaseDocument, savePurchaseDocument } from "../document-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PurchaseRow = {
  id: string;
  supplier_id: string;
  reference: string;
  destination: Country;
  status: string;
  order_date: string | null;
  arrival_date: string | null;
  currency: string;
  exchange_rate: number | string;
  container_type: string | null;
  container_count: number;
  container_numbers: string;
  bl_number: string;
  port_of_loading: string;
  port_of_discharge: string;
  notes: string;
  updated_at: string;
  suppliers: { name: string } | null;
};

type ItemRow = {
  id: string;
  product_id: string | null;
  description: string;
  rolls: number;
  sqm_per_roll: number | string;
  price_basis: string;
  unit_price: number | string;
  products: { name: string } | null;
};

type CostRow = {
  id: string;
  kind: string;
  description: string;
  amount: number | string;
  in_purchase_currency: boolean;
  in_landed_cost: boolean;
};

type Option = { value: string; label: string };

const COLUMNS =
  "id, supplier_id, reference, destination, status, order_date, arrival_date, currency, exchange_rate, container_type, container_count, " +
  "container_numbers, bl_number, port_of_loading, port_of_discharge, notes, updated_at, suppliers(name)";

const DESTINATION_OPTIONS = [
  { value: "", label: "Choose a country" },
  { value: "IN", label: "India (costs in INR)" },
  { value: "AE", label: "United Arab Emirates (costs in AED)" },
];
const STATUS_OPTIONS = PURCHASE_STATUSES.map((value) => ({ value, label: PURCHASE_STATUS_LABELS[value] }));
const CURRENCY_OPTIONS = PURCHASE_CURRENCIES.map((value) => ({ value, label: PURCHASE_CURRENCY_LABELS[value] }));
const CONTAINER_OPTIONS = [{ value: "", label: "Not set" }, ...CONTAINER_TYPES.map((value) => ({ value, label: CONTAINER_TYPE_LABELS[value] }))];
const KIND_OPTIONS = COST_KINDS.map((value) => ({ value, label: COST_KIND_LABELS[value] }));

const sectionHeading = "text-lg font-semibold text-navy";
const card = "rounded-lg border border-slate-200 bg-white p-4";
const editToggle =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-navy hover:bg-slate-100";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New purchase" : "Purchase" };
}

/** The purchase's own details, shared by "New purchase" and an existing purchase. */
function PurchaseFields({ purchase, suppliers, supplierId }: { purchase: PurchaseRow | null; suppliers: Option[]; supplierId: string }) {
  return (
    <div key={purchase?.updated_at ?? "new"} className="space-y-6">
      <Field label="Supplier" name="supplier_id" type="select" required options={suppliers} defaultValue={supplierId} />
      <Field label="Order / invoice number" name="reference" maxLength={200} defaultValue={purchase?.reference} hint="The PO, proforma or commercial invoice number." />
      <Field label="Imported into" name="destination" type="select" required options={DESTINATION_OPTIONS} defaultValue={purchase?.destination ?? ""} />
      <Field label="Status" name="status" type="select" options={STATUS_OPTIONS} defaultValue={purchase?.status ?? "ordered"} />
      <Field label="Order date" name="order_date" type="date" defaultValue={purchase?.order_date} />
      <Field label="Arrival date" name="arrival_date" type="date" defaultValue={purchase?.arrival_date} />
      <Field label="Supplier's currency" name="currency" type="select" options={CURRENCY_OPTIONS} defaultValue={purchase?.currency ?? "USD"} />
      <Field
        label="Exchange rate"
        name="exchange_rate"
        required
        inputMode="decimal"
        maxLength={30}
        defaultValue={purchase ? String(purchase.exchange_rate) : ""}
        hint="What one unit of the supplier's currency cost in rupees (India) or dirhams (UAE). For example 83.5 for USD to INR."
      />
      <Field label="Container" name="container_type" type="select" options={CONTAINER_OPTIONS} defaultValue={purchase?.container_type ?? ""} />
      <Field label="Number of containers" name="container_count" inputMode="numeric" maxLength={5} defaultValue={purchase?.container_count ?? 1} />
      <Field label="Container numbers" name="container_numbers" maxLength={500} defaultValue={purchase?.container_numbers} hint="For example MSCU1234567. Separate several with commas." />
      <Field label="Bill of lading number" name="bl_number" maxLength={200} defaultValue={purchase?.bl_number} />
      <Field label="Port of loading" name="port_of_loading" maxLength={200} defaultValue={purchase?.port_of_loading} hint="For example Qingdao." />
      <Field label="Port of arrival" name="port_of_discharge" maxLength={200} defaultValue={purchase?.port_of_discharge} hint="For example Nhava Sheva or Jebel Ali." />
      <Field label="Notes" name="notes" type="textarea" rows={4} maxLength={5000} spellCheck defaultValue={purchase?.notes} />
    </div>
  );
}

function ItemFields({ purchaseId, item, products, currency }: { purchaseId: string; item: ItemRow | null; products: Option[]; currency: string }) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <Field label="Product" name="product_id" type="select" options={products} defaultValue={item?.product_id ?? ""} />
      <Field
        label="Description"
        name="description"
        maxLength={500}
        defaultValue={item?.description}
        hint="Grade, thickness, roll size. For example 1.5 mm, 7 m × 50 m."
      />
      <Field label="Rolls" name="rolls" required inputMode="numeric" maxLength={12} defaultValue={item?.rolls} />
      <Field label="Square metres per roll" name="sqm_per_roll" required inputMode="decimal" maxLength={20} defaultValue={item ? String(item.sqm_per_roll) : ""} hint="For example 350 for a 7 m × 50 m roll." />
      <Field
        label="Price is"
        name="price_basis"
        type="select"
        options={[
          { value: "sqm", label: "Per square metre" },
          { value: "roll", label: "Per roll" },
        ]}
        defaultValue={item?.price_basis ?? "sqm"}
      />
      <Field label={`Price (${currency})`} name="unit_price" required inputMode="decimal" maxLength={20} defaultValue={item ? String(item.unit_price) : ""} />
    </div>
  );
}

function CostFields({ purchaseId, cost, currency, local }: { purchaseId: string; cost: CostRow | null; currency: string; local: string }) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <Field label="Cost" name="kind" type="select" options={KIND_OPTIONS} defaultValue={cost?.kind ?? "freight"} />
      <Field label="Description" name="description" maxLength={300} defaultValue={cost?.description} hint="Optional. For example the agent's invoice number." />
      <Field label="Amount" name="amount" required inputMode="decimal" maxLength={20} defaultValue={cost ? String(cost.amount) : ""} />
      <Field
        label="Paid in"
        name="paid_in"
        type="select"
        options={[
          { value: "local", label: local },
          { value: "purchase", label: `${currency} (supplier's currency)` },
        ]}
        defaultValue={cost?.in_purchase_currency ? "purchase" : "local"}
      />
      <label className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 p-4">
        <input type="checkbox" name="in_landed_cost" defaultChecked={cost?.in_landed_cost ?? true} className="mt-0.5 size-5 shrink-0 accent-navy" />
        <span>
          <span className="block text-base font-semibold text-slate-900">Count in the landed cost</span>
          <span className="block text-sm text-slate-600">Untick for tax you claim back, such as IGST credit or UAE VAT.</span>
        </span>
      </label>
    </div>
  );
}

/** The fields of a document. A new one also has the file; an existing one keeps its file. */
function DocumentFields({ purchaseId, document, categories }: { purchaseId: string; document: DocumentRow | null; categories: Option[] }) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      {document ? null : (
        <MediaUpload
          bucket={DOCUMENTS_BUCKET}
          folder={documentFolder(purchaseId)}
          value={null}
          accept={DOCUMENT_ACCEPT}
          maxBytes={MAX_DOCUMENT_BYTES}
          name="file_path"
          label="File"
          hint="PDF, photo, Excel, Word or CSV, up to 20 MB."
          privateFile
        />
      )}
      <Field label="Category" name="category_id" type="select" options={categories} defaultValue={document?.category_id ?? ""} />
      <Field
        label="Title"
        name="title"
        required={document !== null}
        maxLength={200}
        defaultValue={document?.title}
        hint={document ? undefined : "Optional. Leave empty to use the file name. For example Commercial invoice AL240618."}
      />
      <Field label="Document date" name="document_date" type="date" defaultValue={document?.document_date} />
      <Field label="Notes" name="notes" type="textarea" rows={3} maxLength={2000} spellCheck defaultValue={document?.notes} />
    </div>
  );
}

type DocumentLink = { url: string; name: string } | null;

/** A 10-minute download link for each document, made with the admin's own session. A failed one is only left without a link. */
async function documentLinks(supabase: SupabaseClient, documents: DocumentRow[]): Promise<Map<string, DocumentLink>> {
  const entries = await Promise.all(
    documents.map(async (document): Promise<[string, DocumentLink]> => {
      const name = displayName(document.file_path);
      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(document.file_path, DOCUMENT_LINK_SECONDS, { download: name });
      if (error || !/^https?:\/\//i.test(data.signedUrl)) {
        if (error) console.error("Could not sign a purchase document", error);
        return [document.id, null];
      }
      return [document.id, { url: data.signedUrl, name }];
    }),
  );
  return new Map(entries);
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-sm font-semibold text-slate-700">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-navy">{value}</dd>
      {detail ? <dd className="mt-0.5 text-sm text-slate-600">{detail}</dd> : null}
    </div>
  );
}

function itemName(item: ItemRow): string {
  return item.products?.name ?? (item.product_id ? "Product" : item.description || "Product");
}

export default async function PurchasePage({ params, searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  const suppliersResult = await supabase.from("suppliers").select("id, name").order("name");
  if (suppliersResult.error) throw new Error(`Could not load suppliers: ${suppliersResult.error.message}`);
  const supplierRows = (suppliersResult.data ?? []) as { id: string; name: string }[];
  const supplierOptions = [{ value: "", label: "Choose a supplier" }, ...supplierRows.map((row) => ({ value: row.id, label: row.name }))];

  if (id === "new") {
    const wanted = (await searchParams).supplier;
    const preselected = typeof wanted === "string" && supplierRows.some((row) => row.id === wanted) ? wanted : "";
    return (
      <>
        <Link href="/admin/purchases" className="text-sm font-semibold text-navy underline underline-offset-4">
          All purchases
        </Link>
        <div className="mt-3">
          <PageHeader title="New purchase" intro="After saving you can add the products and the shipping and import costs." />
        </div>
        {supplierRows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">
            Add the supplier first.{" "}
            <Link href="/admin/suppliers/new" className="font-semibold text-navy underline underline-offset-4">
              New supplier
            </Link>
          </p>
        ) : (
          <div className="mt-8 max-w-2xl">
            <EntityForm action={savePurchase} listHref="/admin/purchases">
              <PurchaseFields purchase={null} suppliers={supplierOptions} supplierId={preselected} />
            </EntityForm>
          </div>
        )}
      </>
    );
  }

  if (!UUID_PATTERN.test(id)) notFound();
  const [purchaseResult, itemsResult, costsResult, productsResult, documentsResult, categoriesResult] = await Promise.all([
    supabase.from("purchases").select(COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("purchase_items")
      .select("id, product_id, description, rolls, sqm_per_roll, price_basis, unit_price, products(name)")
      .eq("purchase_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("purchase_costs")
      .select("id, kind, description, amount, in_purchase_currency, in_landed_cost")
      .eq("purchase_id", id)
      .order("created_at")
      .order("id"),
    supabase.from("products").select("id, name").order("name"),
    supabase
      .from("purchase_documents")
      .select("id, category_id, title, file_path, document_date, notes, created_at")
      .eq("purchase_id", id)
      .order("document_date", { ascending: true, nullsFirst: false })
      .order("created_at")
      .order("id"),
    supabase.from("document_categories").select("id, name, sort_order").order("sort_order").order("name"),
  ]);
  if (purchaseResult.error) throw new Error(`Could not load the purchase: ${purchaseResult.error.message}`);
  if (itemsResult.error) throw new Error(`Could not load the purchase's products: ${itemsResult.error.message}`);
  if (costsResult.error) throw new Error(`Could not load the purchase's costs: ${costsResult.error.message}`);
  if (productsResult.error) throw new Error(`Could not load products: ${productsResult.error.message}`);
  if (documentsResult.error) throw new Error(`Could not load the purchase's documents: ${documentsResult.error.message}`);
  if (categoriesResult.error) throw new Error(`Could not load the document categories: ${categoriesResult.error.message}`);
  if (!purchaseResult.data) notFound();
  const purchase = purchaseResult.data as unknown as PurchaseRow;
  const items = (itemsResult.data ?? []) as unknown as ItemRow[];
  const costs = (costsResult.data ?? []) as CostRow[];
  const productOptions = [
    { value: "", label: "Not in the catalogue (describe it below)" },
    ...((productsResult.data ?? []) as { id: string; name: string }[]).map((row) => ({ value: row.id, label: row.name })),
  ];

  const documents = (documentsResult.data ?? []) as DocumentRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const documentGroups = groupDocuments(documents, categories);
  const links = await documentLinks(supabase, documents);
  const categoryOptions = [{ value: "", label: "No category" }, ...categories.map((row) => ({ value: row.id, label: row.name }))];

  const currency = purchase.currency;
  const local = localCurrency(purchase.destination);
  const sums = purchaseSums(purchase, items, costs);
  const lineSums = new Map<string, LineSums>(sums.lines.map((line) => [line.id, line]));
  const supplierName = purchase.suppliers?.name ?? "Supplier";
  const intro = [
    `Into ${countryName(purchase.destination)}`,
    purchase.order_date ? `ordered ${formatDate(purchase.order_date)}` : null,
    purchase.arrival_date ? `arrived ${formatDate(purchase.arrival_date)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const container = purchase.container_type
    ? `${purchase.container_count} × ${CONTAINER_TYPE_LABELS[purchase.container_type as ContainerType] ?? purchase.container_type}`
    : null;

  return (
    <>
      <Link href="/admin/purchases" className="text-sm font-semibold text-navy underline underline-offset-4">
        All purchases
      </Link>
      <div className="mt-3">
        <PageHeader
          title={purchase.reference ? `${supplierName} · ${purchase.reference}` : supplierName}
          intro={intro}
          action={<PurchaseStatusBadge status={purchase.status} />}
        />
      </div>
      <p className="mt-2 text-sm text-slate-700">
        <Link href={`/admin/suppliers/${purchase.supplier_id}`} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">
          {supplierName}
        </Link>
        {container ? <span className="ml-3">{container}</span> : null}
      </p>

      <section aria-labelledby="summary-heading" className="mt-6">
        <h2 id="summary-heading" className={sectionHeading}>
          Summary
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure label="Quantity" value={`${formatQuantity(sums.area)} m²`} detail={`${formatQuantity(sums.rolls, 0)} rolls`} />
          <Figure
            label="Goods"
            value={formatMoney(sums.goods, currency)}
            detail={`${formatMoney(sums.goodsLocal, local)} at 1 ${currency} = ${formatQuantity(Number(purchase.exchange_rate), 6)} ${local}`}
          />
          <Figure
            label="Shipping and import costs"
            value={formatMoney(sums.costs, local)}
            detail={sums.excludedCosts > 0 ? `Not counted (tax claimed back): ${formatMoney(sums.excludedCosts, local)}` : undefined}
          />
          <Figure label="Landed cost" value={formatMoney(sums.landed, local)} detail="Goods plus counted costs" />
          {sums.landedPerSqm !== null ? (
            <Figure label="Landed cost per m²" value={formatMoney(sums.landedPerSqm, local)} detail="Average over all products" />
          ) : null}
        </dl>
        <p className="mt-3 text-sm text-slate-600">
          Costs are shared between the products in proportion to their value.
        </p>
      </section>

      <section aria-labelledby="items-heading" className="mt-10 max-w-3xl">
        <h2 id="items-heading" className={sectionHeading}>
          Products
        </h2>
        {items.length === 0 ? (
          <p className="mt-3 text-slate-600">No products yet. Add what you bought below.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((item) => {
              const line = lineSums.get(item.id);
              return (
                <li key={item.id} className={card}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="font-semibold text-slate-900">{itemName(item)}</p>
                      {item.description && item.products ? <p className="text-sm text-slate-700">{item.description}</p> : null}
                    </div>
                    <NoteDeleteButton id={item.id} action={deletePurchaseItem} noun="product line" />
                  </div>
                  {line ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-slate-600">Quantity</dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatQuantity(line.rolls, 0)} rolls × {formatQuantity(Number(item.sqm_per_roll), 3)} m² = {formatQuantity(line.area)} m²
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">Supplier price</dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatMoney(line.pricePerSqm, currency, 4)} / m²
                          <span className="block">{formatMoney(line.pricePerRoll, currency)} / roll</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">Goods</dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatMoney(line.goods, currency)}
                          <span className="block">{formatMoney(line.goodsLocal, local)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">Share of costs</dt>
                        <dd className="tabular-nums text-slate-900">{formatMoney(line.costShare, local)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">Landed cost</dt>
                        <dd className="tabular-nums font-semibold text-slate-900">{formatMoney(line.landed, local)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600">Landed per m² / per roll</dt>
                        <dd className="tabular-nums font-semibold text-navy">
                          {formatMoney(line.landedPerSqm, local)} / m²
                          <span className="block">{formatMoney(line.landedPerRoll, local)} / roll</span>
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <details className="mt-2">
                    <summary className={editToggle}>Edit this product line</summary>
                    <div className="mt-3">
                      <EntityForm action={savePurchaseItem} id={item.id} listHref={`/admin/purchases/${purchase.id}`}>
                        <ItemFields purchaseId={purchase.id} item={item} products={productOptions} currency={currency} />
                      </EntityForm>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 id="add-item-heading" className="font-semibold text-slate-900">
            Add a product
          </h3>
          <div className="mt-4" role="region" aria-labelledby="add-item-heading">
            {/* A new key after each saved line brings the form back empty. */}
            <EntityForm key={`item-${items.length}-${items.at(-1)?.id ?? "none"}`} action={savePurchaseItem} listHref={`/admin/purchases/${purchase.id}`} submitLabel="Add product">
              <ItemFields purchaseId={purchase.id} item={null} products={productOptions} currency={currency} />
            </EntityForm>
          </div>
        </div>
      </section>

      <section aria-labelledby="costs-heading" className="mt-10 max-w-3xl">
        <h2 id="costs-heading" className={sectionHeading}>
          Shipping and import costs
        </h2>
        {costs.length === 0 ? (
          <p className="mt-3 text-slate-600">No costs yet. Add freight, customs duty, clearing and the rest below.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {costs.map((cost) => {
              const amount = Number(cost.amount);
              const inLocal = cost.in_purchase_currency ? amount * Number(purchase.exchange_rate) : amount;
              return (
                <li key={cost.id} className={card}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="font-semibold text-slate-900">{COST_KIND_LABELS[cost.kind as CostKind] ?? cost.kind}</p>
                      {cost.description ? <p className="text-sm text-slate-700">{cost.description}</p> : null}
                      <p className="mt-1 tabular-nums text-slate-900">
                        {cost.in_purchase_currency ? (
                          <>
                            {formatMoney(amount, currency)} = {formatMoney(inLocal, local)}
                          </>
                        ) : (
                          formatMoney(amount, local)
                        )}
                        {cost.in_landed_cost ? null : <span className="ml-2 text-sm text-slate-600">(not counted in the landed cost)</span>}
                      </p>
                    </div>
                    <NoteDeleteButton id={cost.id} action={deletePurchaseCost} noun="cost" />
                  </div>
                  <details className="mt-2">
                    <summary className={editToggle}>Edit this cost</summary>
                    <div className="mt-3">
                      <EntityForm action={savePurchaseCost} id={cost.id} listHref={`/admin/purchases/${purchase.id}`}>
                        <CostFields purchaseId={purchase.id} cost={cost} currency={currency} local={local} />
                      </EntityForm>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 id="add-cost-heading" className="font-semibold text-slate-900">
            Add a cost
          </h3>
          <div className="mt-4" role="region" aria-labelledby="add-cost-heading">
            <EntityForm key={`cost-${costs.length}-${costs.at(-1)?.id ?? "none"}`} action={savePurchaseCost} listHref={`/admin/purchases/${purchase.id}`} submitLabel="Add cost">
              <CostFields purchaseId={purchase.id} cost={null} currency={currency} local={local} />
            </EntityForm>
          </div>
        </div>
      </section>

      <section aria-labelledby="documents-heading" className="mt-10 max-w-3xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="documents-heading" className={sectionHeading}>
            Documents
          </h2>
          <Link href="/admin/document-categories" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
            Manage categories
          </Link>
        </div>
        {documents.length === 0 ? (
          <p className="mt-3 text-slate-600">No documents yet. Upload the invoice, packing list, bill of lading, bill of entry and bills below.</p>
        ) : (
          <div className="mt-3 space-y-6">
            {documentGroups.map((group) => (
              <div key={group.category?.id ?? "none"}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {group.category?.name ?? "No category"} <span className="font-normal normal-case">({group.documents.length})</span>
                </h3>
                <ul className="mt-2 space-y-3">
                  {group.documents.map((document) => {
                    const link = links.get(document.id);
                    return (
                      <li key={document.id} className={card}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 [overflow-wrap:anywhere]">
                            <p className="font-semibold text-slate-900">{document.title}</p>
                            <p className="text-sm text-slate-600">
                              {displayName(document.file_path)}
                              {document.document_date ? ` · ${formatDate(document.document_date)}` : null}
                            </p>
                            {document.notes ? <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{document.notes}</p> : null}
                            {link ? (
                              <a href={link.url} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
                                Download<span className="sr-only"> {document.title}</span>
                              </a>
                            ) : (
                              <p className="mt-1 text-sm font-medium text-red-800">The file could not be found.</p>
                            )}
                          </div>
                          <NoteDeleteButton id={document.id} action={deletePurchaseDocument} noun="document" />
                        </div>
                        <details className="mt-2">
                          <summary className={editToggle}>Edit details</summary>
                          <div className="mt-3">
                            <EntityForm key={document.id} action={savePurchaseDocument} id={document.id} listHref={`/admin/purchases/${purchase.id}`}>
                              <DocumentFields purchaseId={purchase.id} document={document} categories={categoryOptions} />
                            </EntityForm>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 id="add-document-heading" className="font-semibold text-slate-900">
            Add a document
          </h3>
          <div className="mt-4" role="region" aria-labelledby="add-document-heading">
            <EntityForm
              key={`document-${documents.length}-${documents.map((document) => document.id).join(",")}`}
              action={savePurchaseDocument}
              listHref={`/admin/purchases/${purchase.id}`}
              submitLabel="Add document"
            >
              <DocumentFields purchaseId={purchase.id} document={null} categories={categoryOptions} />
            </EntityForm>
          </div>
        </div>
      </section>

      <section aria-labelledby="details-heading" className="mt-10 max-w-2xl">
        <h2 id="details-heading" className={sectionHeading}>
          Details
        </h2>
        <div className="mt-4">
          <EntityForm action={savePurchase} id={purchase.id} listHref="/admin/purchases">
            <PurchaseFields purchase={purchase} suppliers={supplierOptions} supplierId={purchase.supplier_id} />
          </EntityForm>
        </div>
        <DeleteButton
          id={purchase.id}
          name={`this purchase from ${supplierName}`}
          noun="purchase"
          action={deletePurchase}
          listHref="/admin/purchases"
        />
      </section>
    </>
  );
}
