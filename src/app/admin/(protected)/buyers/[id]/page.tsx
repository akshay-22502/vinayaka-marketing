import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerNoteForm } from "@/components/admin/BuyerNoteForm";
import { BuyerStatusBadge } from "@/components/admin/BuyerStatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { EntityForm } from "@/components/admin/EntityForm";
import { Field } from "@/components/admin/Field";
import { NoteDeleteButton } from "@/components/admin/NoteDeleteButton";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  BUYER_PRIORITIES,
  BUYER_PRIORITY_LABELS,
  BUYER_STATUSES,
  BUYER_STATUS_LABELS,
  websiteHref,
} from "@/lib/admin/buyers";
import { safeMailto } from "@/lib/admin/quote-view";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { telHref, whatsappHref } from "@/lib/contact";
import type { Country } from "@/lib/content/types";
import { countryName, formatDateTimeIst } from "@/lib/format";
import { addBuyerNote, deleteBuyer, deleteBuyerNote, saveBuyer } from "../actions";

type Props = { params: Promise<{ id: string }> };

type BuyerRow = {
  id: string;
  company: string;
  country: Country;
  buyer_type: string;
  interested_in: string;
  location: string;
  contact_person: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  priority: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
};

type NoteRow = { id: string; body: string; status: string | null; created_at: string };

const COLUMNS =
  "id, company, country, buyer_type, interested_in, location, contact_person, phone, mobile, email, website, priority, status, source, created_at, updated_at";

const COUNTRY_OPTIONS = [
  { value: "", label: "Choose a country" },
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates (UAE)" },
];
const PRIORITY_OPTIONS = [{ value: "", label: "Not set" }, ...BUYER_PRIORITIES.map((value) => ({ value, label: BUYER_PRIORITY_LABELS[value] }))];
const STATUS_OPTIONS = BUYER_STATUSES.map((value) => ({ value, label: BUYER_STATUS_LABELS[value] }));

const contactLink =
  "inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-navy hover:bg-slate-50";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "new" ? "New buyer" : "Buyer" };
}

/** The details form, shared by "New buyer" and an existing buyer. */
function BuyerFields({ buyer }: { buyer: BuyerRow | null }) {
  return (
    <div key={buyer?.updated_at ?? "new"} className="space-y-6">
      <Field label="Company" name="company" required maxLength={200} defaultValue={buyer?.company} />
      <Field label="Country" name="country" type="select" required options={COUNTRY_OPTIONS} defaultValue={buyer?.country ?? ""} />
      {buyer ? null : (
        <Field label="Status" name="status" type="select" options={STATUS_OPTIONS} defaultValue="not_contacted" />
      )}
      <Field label="Priority" name="priority" type="select" options={PRIORITY_OPTIONS} defaultValue={buyer?.priority ?? ""} />
      <Field label="Type" name="buyer_type" maxLength={120} defaultValue={buyer?.buyer_type} hint="For example Trader, Distributor or EPC contractor." />
      <Field
        label="What they would buy"
        name="interested_in"
        type="textarea"
        rows={3}
        maxLength={1000}
        defaultValue={buyer?.interested_in}
      />
      <Field label="Location" name="location" maxLength={200} defaultValue={buyer?.location} hint="City and state, or emirate and area." />
      <Field label="Contact person" name="contact_person" maxLength={200} defaultValue={buyer?.contact_person} />
      <Field label="Phone" name="phone" type="tel" inputMode="tel" maxLength={100} defaultValue={buyer?.phone} />
      <Field
        label="Mobile / WhatsApp"
        name="mobile"
        type="tel"
        inputMode="tel"
        maxLength={100}
        defaultValue={buyer?.mobile}
        hint="With the country code, for example +971 50 123 4567."
      />
      <Field label="Email" name="email" type="email" inputMode="email" maxLength={200} defaultValue={buyer?.email} />
      <Field label="Website" name="website" maxLength={300} spellCheck={false} defaultValue={buyer?.website} />
      <Field label="Source" name="source" maxLength={300} defaultValue={buyer?.source} hint="Where the contact details came from." />
    </div>
  );
}

export default async function BuyerPage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;

  if (id === "new") {
    return (
      <>
        <Link href="/admin/buyers" className="text-sm font-semibold text-navy underline underline-offset-4">
          All buyers
        </Link>
        <div className="mt-3">
          <PageHeader title="New buyer" intro="After saving you can add notes about the buyer." />
        </div>
        <div className="mt-8 max-w-2xl">
          <EntityForm action={saveBuyer} listHref="/admin/buyers">
            <BuyerFields buyer={null} />
          </EntityForm>
        </div>
      </>
    );
  }

  if (!UUID_PATTERN.test(id)) notFound();
  const [buyerResult, notesResult] = await Promise.all([
    supabase.from("wholesale_buyers").select(COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("wholesale_buyer_notes").select("id, body, status, created_at").eq("buyer_id", id).order("created_at", { ascending: false }),
  ]);
  if (buyerResult.error) throw new Error(`Could not load the buyer: ${buyerResult.error.message}`);
  if (notesResult.error) throw new Error(`Could not load the buyer's notes: ${notesResult.error.message}`);
  if (!buyerResult.data) notFound();
  const buyer = buyerResult.data as BuyerRow;
  const notes = (notesResult.data ?? []) as NoteRow[];

  const call = telHref(buyer.mobile) ?? telHref(buyer.phone);
  const whatsapp = whatsappHref(buyer.mobile);
  const mailto = safeMailto(buyer.email);
  const website = websiteHref(buyer.website);
  const place = [buyer.location, countryName(buyer.country)].filter(Boolean).join(", ");

  // Everything here is shown as plain text by React (escaped); links are only made from values that passed a strict check.
  return (
    <>
      <Link href="/admin/buyers" className="text-sm font-semibold text-navy underline underline-offset-4">
        All buyers
      </Link>
      <div className="mt-3">
        <PageHeader title={buyer.company} intro={place} action={<BuyerStatusBadge status={buyer.status} />} />
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

      <section aria-labelledby="update-heading" className="mt-8 max-w-2xl">
        <h2 id="update-heading" className="text-lg font-semibold text-navy">
          Add an update
        </h2>
        <div className="mt-4">
          {/* A new key after each saved note (or status change) brings the form back empty. */}
          <BuyerNoteForm key={`${notes[0]?.id ?? "none"}-${buyer.status}`} buyerId={buyer.id} status={buyer.status} add={addBuyerNote} />
        </div>
      </section>

      <section aria-labelledby="notes-heading" className="mt-10 max-w-2xl">
        <h2 id="notes-heading" className="text-lg font-semibold text-navy">
          Notes
        </h2>
        {notes.length === 0 ? (
          <p className="mt-3 text-slate-600">No notes yet.</p>
        ) : (
          <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {notes.map((note) => (
              <li key={note.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">
                    {formatDateTimeIst(note.created_at)}
                    {note.status ? (
                      <span className="ml-2 font-normal">
                        Status set to <BuyerStatusBadge status={note.status} />
                      </span>
                    ) : null}
                  </p>
                  <NoteDeleteButton id={note.id} action={deleteBuyerNote} />
                </div>
                {note.body ? <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-slate-900">{note.body}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="details-heading" className="mt-10 max-w-2xl">
        <h2 id="details-heading" className="text-lg font-semibold text-navy">
          Details
        </h2>
        <div className="mt-4">
          <EntityForm action={saveBuyer} id={buyer.id} listHref="/admin/buyers">
            <BuyerFields buyer={buyer} />
          </EntityForm>
        </div>
        <DeleteButton id={buyer.id} name={buyer.company} noun="buyer" action={deleteBuyer} listHref="/admin/buyers" />
      </section>
    </>
  );
}
