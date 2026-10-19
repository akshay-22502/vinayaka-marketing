import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Country } from "@/lib/content/types";
import { slugify } from "@/lib/slug";
import { ATTACHMENT_TYPES, attachmentExtension } from "./schema";

/** A validated quote request, ready to be saved. Optional fields the buyer left blank are null. */
export interface NewQuoteRequest {
  name: string;
  company: string | null;
  email: string;
  phone: string;
  country: Country;
  /** Slugs of products that exist and are listed on the site. */
  products: string[];
  quantity: string | null;
  projectLocation: string | null;
  message: string;
  /** Path of the uploaded file inside the `quote-attachments` bucket. */
  attachmentPath: string | null;
  ipHash: string | null;
}

/** Everything the quote API reads and writes in the database. */
export interface QuoteStore {
  /** Requests from this ip hash created at or after `since`. */
  countSince(ipHash: string, since: Date): Promise<number>;
  insert(row: NewQuoteRequest): Promise<{ id: string }>;
  /** Saves the file in the private bucket and returns its path inside the bucket. */
  uploadAttachment(file: File): Promise<string>;
  /** The notification address for a country, from `quote_recipients`; null when none is set. */
  recipientFor(c: Country): Promise<string | null>;
  /** Names of the listed products among these slugs (unknown slugs are dropped), in the order asked. */
  productNames(slugs: string[]): Promise<string[]>;
  /** The slugs among these that are listed products, in the order asked. */
  knownProductSlugs(slugs: string[]): Promise<string[]>;
  markEmailSent(id: string): Promise<void>;
}

const BUCKET = "quote-attachments";

/** Only strings shaped like a product slug are ever put in a query. */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FILE_BASE_MAX = 80;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/**
 * The quote store on top of the service-role client. Quote tables are closed to
 * visitors by row level security, so only the server, with that client, can use it.
 */
export function createSupabaseQuoteStore(client: SupabaseClient): QuoteStore {
  /**
   * Published products in published categories, among the given slugs: the same rule the
   * public pages apply (a product also needs its category to be published).
   */
  async function listedProducts(slugs: string[]): Promise<Array<{ slug: string; name: string }>> {
    const wanted = [...new Set(slugs.filter((slug) => SLUG_SHAPE.test(slug)))];
    if (wanted.length === 0) return [];

    const { data, error } = await client
      .from("products")
      .select("slug, name, categories!inner(published)")
      .in("slug", wanted)
      .eq("published", true)
      .eq("categories.published", true);
    if (error) fail("Could not look up products", error);

    const bySlug = new Map((data ?? []).map((row) => [row.slug as string, row.name as string]));
    return wanted.flatMap((slug) => (bySlug.has(slug) ? [{ slug, name: bySlug.get(slug)! }] : []));
  }

  return {
    async countSince(ipHash, since) {
      const { count, error } = await client
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since.toISOString());
      if (error) fail("Could not count recent quote requests", error);
      return count ?? 0;
    },

    async insert(row) {
      const { data, error } = await client
        .from("quote_requests")
        .insert({
          name: row.name,
          company: row.company,
          email: row.email,
          phone: row.phone,
          country: row.country,
          products: row.products,
          quantity: row.quantity,
          project_location: row.projectLocation,
          message: row.message,
          attachment_path: row.attachmentPath,
          ip_hash: row.ipHash,
        })
        .select("id")
        .single();
      if (error) fail("Could not save the quote request", error);
      return { id: data.id as string };
    },

    async uploadAttachment(file) {
      const extension = attachmentExtension(file.name);
      const type = ATTACHMENT_TYPES[extension];
      if (!type) throw new Error(`Attachment type .${extension} is not allowed`);

      // The path is built from a month folder, a random id and a slug of the name: nothing the
      // buyer typed can add a folder or overwrite another file.
      const base = slugify(file.name.slice(0, file.name.length - extension.length - 1)).slice(0, FILE_BASE_MAX);
      const month = new Date().toISOString().slice(0, 7);
      const path = `${month}/${randomUUID()}-${base.replace(/-+$/, "") || "file"}.${extension}`;

      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: type.storedAs, upsert: false });
      if (error) fail("Could not upload the attachment", error);
      return path;
    },

    async recipientFor(country) {
      const { data, error } = await client
        .from("quote_recipients")
        .select("email")
        .eq("country", country)
        .maybeSingle();
      if (error) fail("Could not look up the quote recipient", error);
      const email = (data?.email as string | undefined)?.trim();
      return email ? email : null;
    },

    async productNames(slugs) {
      return (await listedProducts(slugs)).map((product) => product.name);
    },

    async knownProductSlugs(slugs) {
      return (await listedProducts(slugs)).map((product) => product.slug);
    },

    async markEmailSent(id) {
      const { error } = await client.from("quote_requests").update({ email_sent: true }).eq("id", id);
      if (error) fail("Could not mark the quote request as emailed", error);
    },
  };
}
