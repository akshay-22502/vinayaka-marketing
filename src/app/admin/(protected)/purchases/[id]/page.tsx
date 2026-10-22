import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { MediaUpload } from "@/components/admin/MediaUpload";
import { NoteDeleteButton } from "@/components/admin/NoteDeleteButton";
import { PageHeader } from "@/components/admin/PageHeader";
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
  COST_KIND_LABELS,
  INCOTERMS,
  INCOTERM_LABELS,
  PURCHASE_CURRENCIES,
  PURCHASE_CURRENCY_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STEPS,
  PURCHASE_STEP_LABELS,
  STEP_COST_KINDS,
  effectiveRate,
  formatMoney,
  formatQuantity,
  inCurrencies,
  localCurrency,
  purchaseSums,
  type ContainerType,
  type CostKind,
  type LineSums,
  type PurchaseStep,
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
  quotation_number: string;
  quotation_date: string | null;
  quote_valid_until: string | null;
  incoterm: string | null;
  payment_terms: string;
  bill_of_entry_number: string;
  delivery_date: string | null;
  delivered_to: string;
  transporter: string;
  payment_date: string | null;
  bank_name: string;
  bank_rate: number | string | null;
  usd_rate: number | string | null;
  inr_per_aed: number | string | null;
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
  stage: PurchaseStep;
  kind: string;
  description: string;
  amount: number | string;
  in_purchase_currency: boolean;
  in_landed_cost: boolean;
};

type StepDocumentRow = DocumentRow & { stage: PurchaseStep };

type Option = { value: string; label: string };

const COLUMNS =
  "id, supplier_id, reference, destination, status, order_date, arrival_date, currency, exchange_rate, container_type, container_count, " +
  "container_numbers, bl_number, port_of_loading, port_of_discharge, notes, quotation_number, quotation_date, quote_valid_until, " +
  "incoterm, payment_terms, bill_of_entry_number, delivery_date, delivered_to, transporter, payment_date, bank_name, bank_rate, " +
  "usd_rate, inr_per_aed, updated_at, suppliers(name)";

const DESTINATION_OPTIONS = [
  { value: "", label: "Choose a country" },
  { value: "IN", label: "India (costs in INR)" },
  { value: "AE", label: "United Arab Emirates (costs in AED)" },
];
const STATUS_OPTIONS = PURCHASE_STATUSES.map((value) => ({ value, label: PURCHASE_STATUS_LABELS[value] }));
const CURRENCY_OPTIONS = PURCHASE_CURRENCIES.map((value) => ({ value, label: PURCHASE_CURRENCY_LABELS[value] }));
const CONTAINER_OPTIONS = [{ value: "", label: "Not set" }, ...CONTAINER_TYPES.map((value) => ({ value, label: CONTAINER_TYPE_LABELS[value] }))];
const INCOTERM_OPTIONS = [{ value: "", label: "Not set" }, ...INCOTERMS.map((value) => ({ value, label: INCOTERM_LABELS[value] }))];

const STEP_INTROS: Record<PurchaseStep, string> = {
  quotation: "What the supplier quoted: the products, their prices and terms, and the exchange rate you expect to pay.",
  port: "When the containers reach the port: shipping papers, customs duty, the clearing agent and the port's charges.",
  delivery: "Getting the goods from the port to your warehouse or straight to the buyer.",
  payment: "The rate your bank actually charged when it paid the supplier. It replaces the expected rate in the final price.",
};

const STEP_COSTS_HINT: Record<PurchaseStep, string> = {
  quotation: "Charges the supplier adds on top of the product prices, or freight and insurance when you pay them to the supplier.",
  port: "Sea freight, insurance, customs duty, IGST, the clearing agent, CFS, shipping line and port charges.",
  delivery: "Transport from the port and loading or unloading.",
  payment: "What the bank charged for the transfer.",
};

const stepHeading = "text-xl font-bold text-navy";
const subHeading = "font-semibold text-slate-900";
const card = "rounded-lg border border-slate-200 bg-white p-4";
const addBox = "mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4";
const editToggle =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-navy hover:bg-slate-100";

const rateText = (value: number | string | null) => (value === null || value === undefined ? "" : String(value));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New purchase" : "Purchase" };
}

/** Step 1's fields: the supplier's quotation. A new purchase starts here. */
function QuotationFields({ purchase, suppliers, supplierId }: { purchase: PurchaseRow | null; suppliers: Option[]; supplierId: string }) {
  return (
    <div key={purchase?.updated_at ?? "new"} className="space-y-6">
      <input type="hidden" name="step" value="quotation" />
      <Field label="Supplier" name="supplier_id" type="select" required options={suppliers} defaultValue={supplierId} />
      <Field label="Quotation number" name="quotation_number" maxLength={200} defaultValue={purchase?.quotation_number} hint="The supplier's quotation or proforma invoice number." />
      <Field label="Quotation date" name="quotation_date" type="date" defaultValue={purchase?.quotation_date} />
      <Field label="Quotation valid until" name="quote_valid_until" type="date" defaultValue={purchase?.quote_valid_until} />
      <Field label="Delivery terms" name="incoterm" type="select" options={INCOTERM_OPTIONS} defaultValue={purchase?.incoterm ?? ""} />
      <Field label="Payment terms" name="payment_terms" maxLength={300} defaultValue={purchase?.payment_terms} hint="For example 30% advance, 70% against copy of B/L." />
      <Field label="Imported into" name="destination" type="select" required options={DESTINATION_OPTIONS} defaultValue={purchase?.destination ?? ""} />
      <Field label="Supplier's currency" name="currency" type="select" options={CURRENCY_OPTIONS} defaultValue={purchase?.currency ?? "USD"} />
      <Field
        label="Exchange rate (expected)"
        name="exchange_rate"
        required
        inputMode="decimal"
        maxLength={30}
        defaultValue={purchase ? String(purchase.exchange_rate) : ""}
        hint="What you expect one unit of the supplier's currency to cost in rupees (India) or dirhams (UAE), for example 84.5. The bank's rate in step 4 replaces it."
      />
      <Field label="Status" name="status" type="select" options={STATUS_OPTIONS} defaultValue={purchase?.status ?? "quotation"} />
      <Field label="Order / invoice number" name="reference" maxLength={200} defaultValue={purchase?.reference} hint="Once you order: the PO or commercial invoice number." />
      <Field label="Order date" name="order_date" type="date" defaultValue={purchase?.order_date} />
      <Field label="Notes" name="notes" type="textarea" rows={4} maxLength={5000} spellCheck defaultValue={purchase?.notes} />
    </div>
  );
}

function PortFields({ purchase }: { purchase: PurchaseRow }) {
  return (
    <div key={purchase.updated_at} className="space-y-6">
      <input type="hidden" name="step" value="port" />
      <Field label="Container" name="container_type" type="select" options={CONTAINER_OPTIONS} defaultValue={purchase.container_type ?? ""} />
      <Field label="Number of containers" name="container_count" inputMode="numeric" maxLength={5} defaultValue={purchase.container_count} />
      <Field label="Container numbers" name="container_numbers" maxLength={500} defaultValue={purchase.container_numbers} hint="For example MSCU1234567. Separate several with commas." />
      <Field label="Bill of lading number" name="bl_number" maxLength={200} defaultValue={purchase.bl_number} />
      <Field label="Port of loading" name="port_of_loading" maxLength={200} defaultValue={purchase.port_of_loading} hint="For example Qingdao." />
      <Field label="Port of arrival" name="port_of_discharge" maxLength={200} defaultValue={purchase.port_of_discharge} hint="For example Mundra, Nhava Sheva or Jebel Ali." />
      <Field label="Arrival date" name="arrival_date" type="date" defaultValue={purchase.arrival_date} />
      <Field label="Bill of entry number" name="bill_of_entry_number" maxLength={200} defaultValue={purchase.bill_of_entry_number} />
    </div>
  );
}

function DeliveryFields({ purchase }: { purchase: PurchaseRow }) {
  return (
    <div key={purchase.updated_at} className="space-y-6">
      <input type="hidden" name="step" value="delivery" />
      <Field label="Delivery date" name="delivery_date" type="date" defaultValue={purchase.delivery_date} />
      <Field label="Delivered to" name="delivered_to" maxLength={300} defaultValue={purchase.delivered_to} hint="Your warehouse, or the buyer's site." />
      <Field label="Transporter and vehicle" name="transporter" maxLength={300} defaultValue={purchase.transporter} hint="For example SR Container, GJ01AB1234." />
    </div>
  );
}

function PaymentFields({ purchase }: { purchase: PurchaseRow }) {
  const local = localCurrency(purchase.destination);
  const other = local === "INR" ? "dirhams" : "rupees";
  return (
    <div key={purchase.updated_at} className="space-y-6">
      <input type="hidden" name="step" value="payment" />
      <Field label="Payment date" name="payment_date" type="date" defaultValue={purchase.payment_date} />
      <Field label="Bank" name="bank_name" maxLength={200} defaultValue={purchase.bank_name} />
      <Field
        label={`Bank's rate (1 ${purchase.currency} in ${local})`}
        name="bank_rate"
        inputMode="decimal"
        maxLength={30}
        defaultValue={rateText(purchase.bank_rate)}
        hint="From the bank's remittance advice. Leave empty until you have paid: the expected rate is used until then."
      />
      {purchase.currency === "USD" ? null : (
        <Field
          label={`US dollar rate (1 USD in ${local})`}
          name="usd_rate"
          inputMode="decimal"
          maxLength={30}
          defaultValue={rateText(purchase.usd_rate)}
          hint="Only to show the final price in US dollars."
        />
      )}
      <Field
        label="Dirham rate (1 AED in INR)"
        name="inr_per_aed"
        inputMode="decimal"
        maxLength={30}
        defaultValue={rateText(purchase.inr_per_aed)}
        hint={`To show the final price in ${other} as well. For example 23.1.`}
      />
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

function CostFields({ purchaseId, step, cost, currency, local }: { purchaseId: string; step: PurchaseStep; cost: CostRow | null; currency: string; local: string }) {
  const kinds = STEP_COST_KINDS[step].map((value) => ({ value, label: COST_KIND_LABELS[value] }));
  return (
    <div className="space-y-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <input type="hidden" name="stage" value={step} />
      <Field label="Cost" name="kind" type="select" options={kinds} defaultValue={cost?.kind ?? kinds[0].value} />
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

/** A document's fields. A new one also has the file; an existing one keeps its file. */
function DocumentFields({
  purchaseId,
  step,
  document,
  categories,
}: {
  purchaseId: string;
  step: PurchaseStep;
  document: DocumentRow | null;
  categories: Option[];
}) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <input type="hidden" name="stage" value={step} />
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
        hint={document ? undefined : "Optional. Leave empty to use the file name."}
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

/** "₹54.10 · US$0.6412 · AED 2.34": an amount in each currency there is a rate for. */
function ThreeCurrencies({ amount, purchase }: { amount: number; purchase: PurchaseRow }) {
  const values = inCurrencies(amount, purchase);
  const shown = (["INR", "USD", "AED"] as const).filter((code) => values[code] !== null);
  return (
    <>
      {shown.map((code, index) => (
        <span key={code}>
          {index > 0 ? " · " : null}
          <span className="whitespace-nowrap">{formatMoney(values[code] ?? 0, code, code === "USD" ? 4 : 2)}</span>
        </span>
      ))}
    </>
  );
}

/** One step of a purchase: its own fields, then its costs and its documents. */
function StepSection({ number, step, done, children }: { number: number; step: PurchaseStep; done: boolean; children: ReactNode }) {
  return (
    <section id={`step-${step}`} aria-labelledby={`step-${step}-heading`} className="mt-10 max-w-3xl scroll-mt-20 border-t-4 border-navy/15 pt-6">
      <h2 id={`step-${step}-heading`} className={stepHeading}>
        <span className="mr-2 inline-grid size-8 place-items-center rounded-full bg-navy text-base text-white" aria-hidden="true">
          {done ? "✓" : number}
        </span>
        <span className="sr-only">Step {number}: </span>
        {PURCHASE_STEP_LABELS[step]}
      </h2>
      <p className="mt-1 text-slate-600">{STEP_INTROS[step]}</p>
      {children}
    </section>
  );
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
          <PageHeader
            title="New purchase"
            intro="Start with the supplier's quotation. After saving you add the products, then the port, delivery and bank payment steps as they happen."
          />
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
              <QuotationFields purchase={null} suppliers={supplierOptions} supplierId={preselected} />
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
      .select("id, stage, kind, description, amount, in_purchase_currency, in_landed_cost")
      .eq("purchase_id", id)
      .order("created_at")
      .order("id"),
    supabase.from("products").select("id, name").order("name"),
    supabase
      .from("purchase_documents")
      .select("id, stage, category_id, title, file_path, document_date, notes, created_at")
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
  const documents = (documentsResult.data ?? []) as StepDocumentRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const links = await documentLinks(supabase, documents);
  const categoryOptions = [{ value: "", label: "No category" }, ...categories.map((row) => ({ value: row.id, label: row.name }))];

  const currency = purchase.currency;
  const local = localCurrency(purchase.destination);
  const rate = effectiveRate(purchase);
  const hasBankRate = purchase.bank_rate !== null && Number(purchase.bank_rate) > 0;
  const sums = purchaseSums(purchase, items, costs);
  // What the final price would have been at the expected rate, to compare with the bank's.
  const quotedSums = hasBankRate ? purchaseSums({ ...purchase, bank_rate: null }, items, costs) : null;
  const lineSums = new Map<string, LineSums>(sums.lines.map((line) => [line.id, line]));
  const toLocal = (cost: CostRow) => (cost.in_purchase_currency ? Number(cost.amount) * rate : Number(cost.amount));
  const supplierName = purchase.suppliers?.name ?? "Supplier";
  const intro = [
    `Into ${countryName(purchase.destination)}`,
    purchase.quotation_date ? `quoted ${formatDate(purchase.quotation_date)}` : null,
    purchase.arrival_date ? `arrived ${formatDate(purchase.arrival_date)}` : null,
    purchase.delivery_date ? `delivered ${formatDate(purchase.delivery_date)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const container = purchase.container_type
    ? `${purchase.container_count} × ${CONTAINER_TYPE_LABELS[purchase.container_type as ContainerType] ?? purchase.container_type}`
    : null;

  const costsOf = (step: PurchaseStep) => costs.filter((cost) => cost.stage === step);
  const documentsOf = (step: PurchaseStep) => documents.filter((document) => document.stage === step);
  const stepDone: Record<PurchaseStep, boolean> = {
    quotation: items.length > 0,
    port: purchase.arrival_date !== null || costsOf("port").length > 0,
    delivery: purchase.delivery_date !== null,
    payment: hasBankRate,
  };
  const purchaseHref = `/admin/purchases/${purchase.id}`;
  const otherLocal = local === "INR" ? "AED" : "INR";
  const missingRate = inCurrencies(1, purchase).USD === null || inCurrencies(1, purchase)[otherLocal] === null;

  function costsBlock(step: PurchaseStep) {
    const list = costsOf(step);
    const total = list.filter((cost) => cost.in_landed_cost).reduce((sum, cost) => sum + toLocal(cost), 0);
    return (
      <div className="mt-6">
        <h3 className={subHeading}>Costs</h3>
        <p className="text-sm text-slate-600">{STEP_COSTS_HINT[step]}</p>
        {list.length === 0 ? (
          <p className="mt-2 text-slate-600">No costs at this step yet.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {list.map((cost) => {
                const amount = Number(cost.amount);
                return (
                  <li key={cost.id} className={card}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <p className="font-semibold text-slate-900">{COST_KIND_LABELS[cost.kind as CostKind] ?? cost.kind}</p>
                        {cost.description ? <p className="text-sm text-slate-700">{cost.description}</p> : null}
                        <p className="mt-1 tabular-nums text-slate-900">
                          {cost.in_purchase_currency ? (
                            <>
                              {formatMoney(amount, currency)} = {formatMoney(toLocal(cost), local)}
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
                        <EntityForm action={savePurchaseCost} id={cost.id} listHref={purchaseHref}>
                          <CostFields purchaseId={purchase.id} step={step} cost={cost} currency={currency} local={local} />
                        </EntityForm>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-sm font-semibold tabular-nums text-slate-800">Counted at this step: {formatMoney(total, local)}</p>
          </>
        )}
        <div className={addBox}>
          <h4 id={`add-cost-${step}-heading`} className={subHeading}>
            Add a cost
          </h4>
          <div className="mt-4" role="region" aria-labelledby={`add-cost-${step}-heading`}>
            <EntityForm key={`cost-${step}-${list.length}-${list.at(-1)?.id ?? "none"}`} action={savePurchaseCost} listHref={purchaseHref} submitLabel="Add cost">
              <CostFields purchaseId={purchase.id} step={step} cost={null} currency={currency} local={local} />
            </EntityForm>
          </div>
        </div>
      </div>
    );
  }

  function documentsBlock(step: PurchaseStep) {
    const list = documentsOf(step);
    const groups = groupDocuments(list, categories);
    return (
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={subHeading}>Documents</h3>
          <Link href="/admin/document-categories" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4">
            Manage categories
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="mt-1 text-slate-600">No documents at this step yet.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {groups.map((group) => (
              <div key={group.category?.id ?? "none"}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {group.category?.name ?? "No category"} <span className="font-normal normal-case">({group.documents.length})</span>
                </h4>
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
                            <EntityForm key={document.id} action={savePurchaseDocument} id={document.id} listHref={purchaseHref}>
                              <DocumentFields purchaseId={purchase.id} step={step} document={document} categories={categoryOptions} />
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
        <div className={addBox}>
          <h4 id={`add-document-${step}-heading`} className={subHeading}>
            Add a document
          </h4>
          <div className="mt-4" role="region" aria-labelledby={`add-document-${step}-heading`}>
            <EntityForm
              key={`document-${step}-${list.length}-${list.map((document) => document.id).join(",")}`}
              action={savePurchaseDocument}
              listHref={purchaseHref}
              submitLabel="Add document"
            >
              <DocumentFields purchaseId={purchase.id} step={step} document={null} categories={categoryOptions} />
            </EntityForm>
          </div>
        </div>
      </div>
    );
  }

  function stepForm(fields: ReactNode, open: boolean) {
    return (
      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-4" open={open}>
        <summary className={editToggle}>Details of this step</summary>
        <div className="mt-3">
          <EntityForm action={savePurchase} id={purchase.id} listHref="/admin/purchases">
            {fields}
          </EntityForm>
        </div>
      </details>
    );
  }

  const stepCosts = PURCHASE_STEPS.map((step) => ({
    step,
    total: costsOf(step)
      .filter((cost) => cost.in_landed_cost)
      .reduce((sum, cost) => sum + toLocal(cost), 0),
  }));

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

      <nav aria-label="Steps of this purchase" className="mt-4">
        <ol className="grid gap-2 sm:grid-cols-5">
          {PURCHASE_STEPS.map((step, index) => (
            <li key={step}>
              <a
                href={`#step-${step}`}
                className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-slate-50"
              >
                <span
                  aria-hidden="true"
                  className={`inline-grid size-6 shrink-0 place-items-center rounded-full text-xs ${stepDone[step] ? "bg-green-700 text-white" : "bg-slate-200 text-slate-800"}`}
                >
                  {stepDone[step] ? "✓" : index + 1}
                </span>
                <span>
                  {PURCHASE_STEP_LABELS[step]}
                  {stepDone[step] ? <span className="sr-only"> (done)</span> : null}
                </span>
              </a>
            </li>
          ))}
          <li>
            <a href="#final-price" className="flex min-h-11 items-center rounded-md border border-navy bg-navy px-3 py-2 text-sm font-semibold text-white">
              Final price per m²
            </a>
          </li>
        </ol>
      </nav>

      <StepSection number={1} step="quotation" done={stepDone.quotation}>
        {stepForm(<QuotationFields purchase={purchase} suppliers={supplierOptions} supplierId={purchase.supplier_id} />, false)}

        <section aria-labelledby="items-heading" className="mt-6">
          <h3 id="items-heading" className={subHeading}>
            Products
          </h3>
          {items.length === 0 ? (
            <p className="mt-2 text-slate-600">No products yet. Add what the supplier quoted below.</p>
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
                      </dl>
                    ) : null}
                    <details className="mt-2">
                      <summary className={editToggle}>Edit this product line</summary>
                      <div className="mt-3">
                        <EntityForm action={savePurchaseItem} id={item.id} listHref={purchaseHref}>
                          <ItemFields purchaseId={purchase.id} item={item} products={productOptions} currency={currency} />
                        </EntityForm>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={addBox}>
            <h4 id="add-item-heading" className={subHeading}>
              Add a product
            </h4>
            <div className="mt-4" role="region" aria-labelledby="add-item-heading">
              {/* A new key after each saved line brings the form back empty. */}
              <EntityForm key={`item-${items.length}-${items.at(-1)?.id ?? "none"}`} action={savePurchaseItem} listHref={purchaseHref} submitLabel="Add product">
                <ItemFields purchaseId={purchase.id} item={null} products={productOptions} currency={currency} />
              </EntityForm>
            </div>
          </div>
        </section>

        {costsBlock("quotation")}
        {documentsBlock("quotation")}
      </StepSection>

      <StepSection number={2} step="port" done={stepDone.port}>
        {stepForm(<PortFields purchase={purchase} />, !stepDone.port && stepDone.quotation)}
        {costsBlock("port")}
        {documentsBlock("port")}
      </StepSection>

      <StepSection number={3} step="delivery" done={stepDone.delivery}>
        {stepForm(<DeliveryFields purchase={purchase} />, !stepDone.delivery && stepDone.port)}
        {costsBlock("delivery")}
        {documentsBlock("delivery")}
      </StepSection>

      <StepSection number={4} step="payment" done={stepDone.payment}>
        {stepForm(<PaymentFields purchase={purchase} />, !stepDone.payment || missingRate)}
        {costsBlock("payment")}
        {documentsBlock("payment")}
      </StepSection>

      <section id="final-price" aria-labelledby="final-heading" className="mt-10 max-w-3xl scroll-mt-20 rounded-xl border-2 border-navy bg-slate-50 p-4 sm:p-6">
        <h2 id="final-heading" className={stepHeading}>
          Final price
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          {hasBankRate
            ? `At the bank's rate: 1 ${currency} = ${formatQuantity(rate, 6)} ${local}.`
            : `Estimate at the expected rate (1 ${currency} = ${formatQuantity(rate, 6)} ${local}). Enter the bank's rate in step 4 for the final price.`}{" "}
          Costs are shared between the products in proportion to their value.
        </p>

        {sums.landedPerSqm !== null ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">Landed cost per m², all products</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-navy">
              <ThreeCurrencies amount={sums.landedPerSqm} purchase={purchase} />
            </p>
            {quotedSums && quotedSums.landedPerSqm !== null ? (
              <p className="mt-1 text-sm text-slate-600">
                At the expected rate it would have been {formatMoney(quotedSums.landedPerSqm, local)} per m² (
                {sums.landedPerSqm >= quotedSums.landedPerSqm ? "+" : "−"}
                {formatMoney(Math.abs(sums.landedPerSqm - quotedSums.landedPerSqm), local)}).
              </p>
            ) : null}
            {missingRate ? <p className="mt-1 text-sm text-slate-600">Add the missing rates in step 4 to see every currency.</p> : null}
          </div>
        ) : (
          <p className="mt-4 text-slate-600">Add the products in step 1 to see the price per m².</p>
        )}

        {sums.lines.length > 1 ? (
          <ul className="mt-4 space-y-3">
            {items.map((item) => {
              const line = lineSums.get(item.id);
              if (!line) return null;
              return (
                <li key={item.id} className={card}>
                  <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{itemName(item)}</p>
                  {item.description && item.products ? <p className="text-sm text-slate-700">{item.description}</p> : null}
                  <p className="mt-1 font-semibold tabular-nums text-navy">
                    <ThreeCurrencies amount={line.landedPerSqm} purchase={purchase} /> <span className="font-normal text-slate-600">per m²</span>
                  </p>
                  <p className="text-sm tabular-nums text-slate-600">
                    {formatMoney(line.landedPerRoll, local)} per roll · {formatQuantity(line.area)} m²
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Figure label="Quantity" value={`${formatQuantity(sums.area)} m²`} detail={`${formatQuantity(sums.rolls, 0)} rolls`} />
          <Figure label="Goods" value={formatMoney(sums.goodsLocal, local)} detail={formatMoney(sums.goods, currency)} />
          {stepCosts.map(({ step, total }) => (
            <Figure key={step} label={`Costs: ${PURCHASE_STEP_LABELS[step].toLowerCase()}`} value={formatMoney(total, local)} />
          ))}
          <Figure
            label="Landed cost"
            value={formatMoney(sums.landed, local)}
            detail={sums.excludedCosts > 0 ? `Not counted (tax claimed back): ${formatMoney(sums.excludedCosts, local)}` : "Goods plus counted costs"}
          />
        </dl>
      </section>

      <div className="mt-10 max-w-2xl">
        <DeleteButton
          id={purchase.id}
          name={`this purchase from ${supplierName}`}
          noun="purchase"
          action={deletePurchase}
          listHref="/admin/purchases"
        />
      </div>
    </>
  );
}
