import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmailNotSentBadge, QuoteStatusBadge } from "@/components/admin/QuoteBadges";
import { QuoteReviewForm } from "@/components/admin/QuoteReviewForm";
import { attachmentLabel, isMissingFileError, productLabels, safeMailto } from "@/lib/admin/quote-view";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN } from "@/lib/admin/schemas";
import { telHref } from "@/lib/contact";
import type { Country } from "@/lib/content/types";
import { countryName, formatDateTimeUtc } from "@/lib/format";
import { updateQuote } from "../actions";

export const metadata: Metadata = { title: "Quote request" };

// The attachment link is made for each request for this page and expires, so the page must never be cached.
export const dynamic = "force-dynamic";

/** How long the attachment link works. */
const SIGNED_URL_SECONDS = 600;

type Props = { params: Promise<{ id: string }> };

type QuoteRow = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string;
  country: Country;
  products: string[];
  quantity: string | null;
  project_location: string | null;
  message: string;
  attachment_path: string | null;
  status: string;
  admin_notes: string | null;
  email_sent: boolean;
  created_at: string;
  updated_at: string;
};

// Not ip_hash: the admin has no use for it.
const COLUMNS =
  "id, name, company, email, phone, country, products, quantity, project_location, message, attachment_path, status, admin_notes, email_sent, created_at, updated_at";

type Attachment =
  | { kind: "none" }
  | { kind: "link"; name: string; url: string }
  | { kind: "missing"; name: string }
  | { kind: "unavailable"; name: string };

/** A 10-minute link to the buyer's file, made with the admin's own session (storage policy: admins read quote-attachments). */
async function attachmentFor(supabase: SupabaseClient, path: string | null): Promise<Attachment> {
  if (!path) return { kind: "none" };
  const name = attachmentLabel(path);
  const { data, error } = await supabase.storage.from("quote-attachments").createSignedUrl(path, SIGNED_URL_SECONDS, { download: name });
  if (error) {
    if (isMissingFileError(error)) return { kind: "missing", name };
    console.error("Could not sign the quote attachment", error);
    return { kind: "unavailable", name };
  }
  // Storage answers with an http(s) address; anything else is not offered as a link.
  return /^https?:\/\//i.test(data.signedUrl) ? { kind: "link", name, url: data.signedUrl } : { kind: "unavailable", name };
}

/** Names for the product slugs on the request. A failed lookup only means the slugs are shown instead. */
async function namesFor(supabase: SupabaseClient, slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase.from("products").select("slug, name").in("slug", slugs);
  if (error) {
    console.error("Could not look up product names for a quote request", error);
    return new Map();
  }
  return new Map((data ?? []).map((product) => [product.slug as string, product.name as string]));
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-semibold text-slate-700">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-slate-900">{children}</dd>
    </div>
  );
}

const linkClass = "font-medium text-navy underline underline-offset-2 hover:text-slate-900";
const notGiven = <span className="text-slate-600">Not given</span>;

export default async function QuotePage({ params }: Props) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { data, error } = await supabase.from("quote_requests").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the quote request: ${error.message}`);
  if (!data) notFound();
  const quote = data as QuoteRow;

  const [attachment, names] = await Promise.all([attachmentFor(supabase, quote.attachment_path), namesFor(supabase, quote.products)]);
  const products = productLabels(quote.products, names);
  const mailto = safeMailto(quote.email);
  const tel = telHref(quote.phone);
  const where = countryName(quote.country);

  // Everything below that came from the buyer is rendered as plain text by React (escaped). Nothing is
  // parsed as HTML or Markdown, and links are only made from values that passed a strict check.
  return (
    <>
      <Link href="/admin/quotes" className="text-sm font-semibold text-navy underline underline-offset-4">
        All quote requests
      </Link>
      <div className="mt-3">
        <PageHeader
          title={quote.name}
          intro={`Received ${formatDateTimeUtc(quote.created_at)}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <QuoteStatusBadge status={quote.status} />
              {quote.email_sent ? null : <EmailNotSentBadge />}
            </div>
          }
        />
      </div>

      {quote.email_sent ? null : (
        <p className="mt-6 max-w-3xl rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          The email to the {where} team about this request was not sent. This usually means no quote recipient is set for {where}, or the
          email service was down. Check{" "}
          <Link href="/admin/settings" className="font-semibold underline underline-offset-2">
            Settings
          </Link>
          , and reply to the buyer yourself.
        </p>
      )}

      <dl className="mt-6 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
        <Row label="Name">{quote.name}</Row>
        <Row label="Company">{quote.company || notGiven}</Row>
        <Row label="Email">
          {mailto ? (
            <a href={mailto} className={linkClass}>
              {quote.email}
            </a>
          ) : (
            quote.email
          )}
        </Row>
        <Row label="Phone">
          {tel ? (
            <a href={tel} className={linkClass}>
              {quote.phone}
            </a>
          ) : (
            quote.phone
          )}
        </Row>
        <Row label="Country">{where}</Row>
        <Row label="Products">
          {products.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5">
              {products.map((product, index) => (
                <li key={`${index}-${product}`}>{product}</li>
              ))}
            </ul>
          ) : (
            notGiven
          )}
        </Row>
        <Row label="Quantity">{quote.quantity || notGiven}</Row>
        <Row label="Project location">{quote.project_location || notGiven}</Row>
        <Row label="Attachment">
          {attachment.kind === "none" ? (
            "No attachment"
          ) : attachment.kind === "link" ? (
            <>
              <a href={attachment.url} download={attachment.name} rel="noopener noreferrer" className={linkClass}>
                {attachment.name}
              </a>
              <span className="mt-1 block text-sm text-slate-600">
                Downloads the file the buyer sent. The link works for 10 minutes; reload this page for a new one.
              </span>
            </>
          ) : attachment.kind === "missing" ? (
            <>
              <span>{attachment.name}</span>
              <span className="mt-1 block text-sm font-medium text-red-800">
                The attached file is missing from storage. Ask the buyer to send it again.
              </span>
            </>
          ) : (
            <>
              <span>{attachment.name}</span>
              <span className="mt-1 block text-sm font-medium text-red-800">
                The download link could not be made just now. Reload this page to try again.
              </span>
            </>
          )}
        </Row>
      </dl>

      <section aria-labelledby="message-heading" className="mt-8 max-w-3xl">
        <h2 id="message-heading" className="text-lg font-semibold text-navy">
          Message
        </h2>
        <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-900">
          {quote.message}
        </p>
      </section>

      <section aria-labelledby="review-heading" className="mt-10 max-w-2xl">
        <h2 id="review-heading" className="text-lg font-semibold text-navy">
          Follow-up
        </h2>
        <div className="mt-4">
          <QuoteReviewForm
            id={quote.id}
            status={quote.status}
            adminNotes={quote.admin_notes}
            updatedAt={quote.updated_at}
            update={updateQuote}
          />
        </div>
      </section>
    </>
  );
}
