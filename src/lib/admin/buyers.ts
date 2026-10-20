import { z } from "zod";
import type { Country } from "@/lib/content/types";
import { line, paragraphs } from "./schemas";

// The wholesale buyers list in the admin: statuses, the list's query parameters and the form
// schemas. Plain module (no server or browser APIs), so pages, actions and unit tests share it.

/** Where a buyer is on the way to becoming a customer, in the order a buyer usually moves. */
export const BUYER_STATUSES = ["not_contacted", "contacted", "in_discussion", "quoted", "onboarded", "not_interested"] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

export const BUYER_STATUS_LABELS: Record<BuyerStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  in_discussion: "In discussion",
  quoted: "Quote sent",
  onboarded: "Onboarded",
  not_interested: "Not interested",
};

export const BUYER_PRIORITIES = ["high", "medium", "low"] as const;
export type BuyerPriority = (typeof BUYER_PRIORITIES)[number];

export const BUYER_PRIORITY_LABELS: Record<BuyerPriority, string> = { high: "High", medium: "Medium", low: "Low" };

export const BUYER_COUNTRIES = ["IN", "AE"] as const satisfies readonly Country[];

/** The longest note (the form's maxlength and the schema's limit). */
export const BUYER_NOTE_MAX = 5000;
/** The longest search text; anything after it is ignored. */
const SEARCH_MAX = 100;

// List filters (?country=, ?status=, ?q=, ?page=) ------------------------------------------

export type BuyerFilters = {
  country: Country | null;
  status: BuyerStatus | null;
  /** Part of a company name, or "" for no search. */
  q: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_PATTERN = /^\d{1,6}$/;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

/** The filters in the address of the list. Unknown or malformed values fall back to "no filter" and page 1. */
export function parseBuyerFilters(params: SearchParams): BuyerFilters {
  const rawPage = firstValue(params.page);
  const page = rawPage !== undefined && PAGE_PATTERN.test(rawPage) ? Number(rawPage) : 0;
  return {
    country: oneOf(BUYER_COUNTRIES, firstValue(params.country)),
    status: oneOf(BUYER_STATUSES, firstValue(params.status)),
    q: (firstValue(params.q) ?? "").trim().slice(0, SEARCH_MAX),
    page: page >= 1 ? page : 1,
  };
}

/** The address of the list with these filters. Left-out filters and page 1 are not written. */
export function buyersHref(filters: Partial<BuyerFilters>): string {
  const query = new URLSearchParams();
  if (filters.country) query.set("country", filters.country);
  if (filters.status) query.set("status", filters.status);
  if (filters.q) query.set("q", filters.q);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const text = query.toString();
  return text ? `/admin/buyers?${text}` : "/admin/buyers";
}

/** A search text as an ILIKE pattern that matches it anywhere: %, _ and \ match only themselves. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The website as an https link, or null. "example.com" becomes "https://example.com"; other schemes are not links. */
export function websiteHref(website: string): string | null {
  const text = website.trim();
  if (text === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

// Forms ------------------------------------------------------------------------------------

const optionalPriority = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || (BUYER_PRIORITIES as readonly string[]).includes(value), "Choose a priority")
  .transform((value) => (value === "" ? null : (value as BuyerPriority)));

const statusField = z.enum(BUYER_STATUSES, { error: "Choose a status" });

const buyerFields = {
  company: z.string({ error: "Enter the company name" }).trim().min(1, "Enter the company name").max(200, "Company must be 200 characters or fewer"),
  country: z.enum(BUYER_COUNTRIES, { error: "Choose a country" }),
  buyer_type: line("Type", 120),
  interested_in: paragraphs("What they would buy", 1000),
  location: line("Location", 200),
  contact_person: line("Contact person", 200),
  phone: line("Phone", 100),
  mobile: line("Mobile / WhatsApp", 100),
  email: line("Email", 200),
  website: line("Website", 300),
  priority: optionalPriority,
  source: line("Source", 300),
};

/** A new buyer: the details and the status to start at. */
export const newBuyerSchema = z.object({ ...buyerFields, status: statusField });

/** An existing buyer's details. The status changes through a note (see buyerNoteSchema), so the log records it. */
export const buyerSchema = z.object(buyerFields);

export const NOTE_EMPTY_MESSAGE = "Write a note or choose a new status";

/**
 * An update about a buyer: a note, a new status, or both. Called as addBuyerNote(buyerId, { status, body }),
 * where `status` is the status chosen in the form; it is stored on the note only when it differs from
 * `currentStatus` (the buyer's status when the page was loaded).
 */
export const buyerNoteSchema = z
  .object({
    status: statusField,
    currentStatus: z.string().default(""),
    body: paragraphs("Note", BUYER_NOTE_MAX),
  })
  .transform((value) => ({ body: value.body, status: value.status === value.currentStatus ? null : value.status }))
  .superRefine((value, ctx) => {
    if (value.body === "" && value.status === null) ctx.addIssue({ code: "custom", path: ["body"], message: NOTE_EMPTY_MESSAGE });
  });

export type BuyerNoteInput = z.output<typeof buyerNoteSchema>;
