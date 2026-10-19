import { z } from "zod";
import type { Country } from "@/lib/content/types";
import { line, paragraphs } from "./schemas";

// What the Settings form may send: the `site_settings` columns, and the quote recipient email of each
// country (stored in `quote_recipients`, never in `site_settings`, so visitors cannot read it).
//
// Contact details are checked loosely: the point is to catch a typo, not to police how a number is
// written. A "[bracketed]" placeholder is accepted in the office contact fields because that is what
// the seed leaves there (see lib/contact.ts): saving the form without touching them must work, and
// the site shows them as plain text, never as links. A quote recipient is different: it receives real
// email, so it must be a real address.

export const PHONE_MESSAGE = "Enter a phone number with 5 to 20 digits, using digits, spaces, + - and ( ) only";
export const WHATSAPP_MESSAGE =
  "Enter the WhatsApp number with its country code: 8 to 15 digits, using digits, spaces, + - and ( ) only";
export const EMAIL_MESSAGE = "Enter a valid email address";
export const RECIPIENT_MESSAGE = "Enter one valid email address, or leave this blank to stop emails for this country";

const PHONE_MAX_LENGTH = 40;
const EMAIL_MAX_LENGTH = 254;

/** One short phrase in square brackets, like the seed's "[India phone]". No markup, no nested brackets. */
const PLACEHOLDER = /^\[[^[\]<>\r\n]{1,60}\]$/;
const PHONE_CHARACTERS = /^[0-9 +\-()]+$/;

const isEmail = (value: string) => value.length <= EMAIL_MAX_LENGTH && z.email().safeParse(value).success;

/** A number written with digits, spaces, + - and parentheses, with a digit count in `min..max`. */
function digitsField(message: string, digits: { min: number; max: number }) {
  return z
    .string()
    .trim()
    .max(PHONE_MAX_LENGTH, message)
    .default("")
    .superRefine((value, ctx) => {
      if (value === "" || PLACEHOLDER.test(value)) return;
      const count = value.replace(/\D/g, "").length;
      if (!PHONE_CHARACTERS.test(value) || count < digits.min || count > digits.max) {
        ctx.addIssue({ code: "custom", message });
      }
    });
}

const phone = () => digitsField(PHONE_MESSAGE, { min: 5, max: 20 });
const whatsapp = () => digitsField(WHATSAPP_MESSAGE, { min: 8, max: 15 });

/** The public email of an office: blank, a placeholder, or an address. */
const officeEmail = z
  .string()
  .trim()
  .default("")
  .superRefine((value, ctx) => {
    if (value === "" || PLACEHOLDER.test(value) || isEmail(value)) return;
    ctx.addIssue({ code: "custom", message: EMAIL_MESSAGE });
  });

/** Where a country's quote requests are emailed: blank (no emails, the row is deleted) or one address. */
const recipient = z
  .string()
  .trim()
  .default("")
  .superRefine((value, ctx) => {
    if (value === "" || isEmail(value)) return;
    ctx.addIssue({ code: "custom", message: RECIPIENT_MESSAGE });
  })
  .transform((value) => (value === "" ? null : value));

export const settingsSchema = z
  .object({
    tagline: line("Tagline", 200),
    hero_title: line("Home page title", 200),
    hero_text: paragraphs("Home page text", 1000),
    about_md: paragraphs("About text", 20000),
    india_address: paragraphs("India address", 500),
    india_phone: phone(),
    india_whatsapp: whatsapp(),
    india_email: officeEmail,
    uae_address: paragraphs("UAE address", 500),
    uae_phone: phone(),
    uae_whatsapp: whatsapp(),
    uae_email: officeEmail,
    india_recipient: recipient,
    uae_recipient: recipient,
  })
  .transform(({ india_recipient, uae_recipient, ...settings }) => ({
    /** The `site_settings` columns. */
    settings,
    /** The quote recipient of each country; null means none (that country's row is deleted). */
    recipients: { IN: india_recipient, AE: uae_recipient } satisfies Record<Country, string | null>,
  }));

export type SettingsInput = z.output<typeof settingsSchema>;
