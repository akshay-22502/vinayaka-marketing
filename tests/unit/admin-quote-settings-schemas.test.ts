import { describe, expect, it } from "vitest";
import { parseForm, parseInput } from "@/lib/admin/schemas";
import { ADMIN_NOTES_MAX, quoteUpdateSchema } from "@/lib/admin/quote-update-schema";
import {
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  RECIPIENT_MESSAGE,
  WHATSAPP_MESSAGE,
  settingsSchema,
} from "@/lib/admin/settings-schema";

// The rules behind the quote review form (status + notes) and the Settings form.

function ok<T>(result: { ok: true; data: T } | { ok: false; errors: Record<string, string> }): T {
  if (!result.ok) throw new Error(`Expected valid input, got errors: ${JSON.stringify(result.errors)}`);
  return result.data;
}

function errorsOf(result: { ok: boolean; errors?: Record<string, string> }): Record<string, string> {
  if (result.ok) throw new Error("Expected invalid input");
  return result.errors ?? {};
}

describe("quoteUpdateSchema", () => {
  it("accepts each of the four statuses", () => {
    for (const status of ["new", "contacted", "quoted", "closed"]) {
      expect(ok(parseInput(quoteUpdateSchema, { status, adminNotes: "" })).status).toBe(status);
    }
  });

  it("refuses a status that is not one of the four, or none", () => {
    for (const status of ["won", "NEW", "", " new", undefined, null, 3, ["new"], { toString: () => "new" }]) {
      expect(errorsOf(parseInput(quoteUpdateSchema, { status, adminNotes: "" })), String(status)).toEqual({
        status: "Choose a status",
      });
    }
  });

  it("trims the notes, makes line breaks plain, and stores blank notes as null", () => {
    expect(ok(parseInput(quoteUpdateSchema, { status: "new", adminNotes: "  Called\r\nWill email  " })).adminNotes).toBe(
      "Called\nWill email",
    );
    expect(ok(parseInput(quoteUpdateSchema, { status: "new", adminNotes: "   \r\n " })).adminNotes).toBeNull();
    expect(ok(parseInput(quoteUpdateSchema, { status: "new" })).adminNotes).toBeNull();
  });

  it("caps the notes", () => {
    expect(ok(parseInput(quoteUpdateSchema, { status: "new", adminNotes: "x".repeat(ADMIN_NOTES_MAX) })).adminNotes).toHaveLength(
      ADMIN_NOTES_MAX,
    );
    expect(errorsOf(parseInput(quoteUpdateSchema, { status: "new", adminNotes: "x".repeat(ADMIN_NOTES_MAX + 1) }))).toEqual({
      adminNotes: `Notes must be ${ADMIN_NOTES_MAX} characters or fewer`,
    });
  });

  it("drops fields it does not know, so a hand-made call cannot set other columns", () => {
    const data = ok(
      parseInput(quoteUpdateSchema, { status: "closed", adminNotes: "", email_sent: true, message: "changed", id: "x", ip_hash: "y" }),
    );
    expect(data).toEqual({ status: "closed", adminNotes: null });
  });

  it("refuses something that is not an object", () => {
    expect(parseInput(quoteUpdateSchema, null).ok).toBe(false);
    expect(parseInput(quoteUpdateSchema, "closed").ok).toBe(false);
  });
});

// Settings -----------------------------------------------------------------------------------------

function settingsForm(over: Record<string, string> = {}): FormData {
  const fields: Record<string, string> = {
    tagline: "Geosynthetic solutions",
    hero_title: "Reinforce, line and protect",
    hero_text: "We supply geosynthetics.",
    about_md: "## About\r\n\r\nText",
    india_address: "Plot 4\r\nPune",
    india_phone: "+91 98765 43210",
    india_whatsapp: "+91 98765 43210",
    india_email: "pune@terratechbharat.example",
    uae_address: "Office 12\r\nDubai",
    uae_phone: "+971 4 123 4567",
    uae_whatsapp: "+971 50 123 4567",
    uae_email: "dubai@terratechbharat.example",
    india_recipient: "india-quotes@terratechbharat.example",
    uae_recipient: "uae-quotes@terratechbharat.example",
    ...over,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

describe("settingsSchema", () => {
  it("splits a valid form into the site_settings columns and the recipients", () => {
    const data = ok(parseForm(settingsSchema, settingsForm()));
    expect(data.settings).toEqual({
      tagline: "Geosynthetic solutions",
      hero_title: "Reinforce, line and protect",
      hero_text: "We supply geosynthetics.",
      about_md: "## About\n\nText",
      india_address: "Plot 4\nPune",
      india_phone: "+91 98765 43210",
      india_whatsapp: "+91 98765 43210",
      india_email: "pune@terratechbharat.example",
      uae_address: "Office 12\nDubai",
      uae_phone: "+971 4 123 4567",
      uae_whatsapp: "+971 50 123 4567",
      uae_email: "dubai@terratechbharat.example",
    });
    expect(data.recipients).toEqual({
      IN: "india-quotes@terratechbharat.example",
      AE: "uae-quotes@terratechbharat.example",
    });
  });

  it("treats every field as optional: a blank form is valid and clears the texts", () => {
    const data = ok(parseInput(settingsSchema, {}));
    expect(Object.values(data.settings).every((value) => value === "")).toBe(true);
    expect(data.recipients).toEqual({ IN: null, AE: null });
  });

  it("stores a blank recipient as null, which deletes that country's row (R16)", () => {
    const data = ok(parseForm(settingsSchema, settingsForm({ india_recipient: "  ", uae_recipient: "" })));
    expect(data.recipients).toEqual({ IN: null, AE: null });
  });

  it("drops fields it does not know, so a hand-made request cannot set other columns", () => {
    const form = settingsForm();
    form.append("id", "2");
    form.append("created_at", "2000-01-01");
    form.append("updated_at", "2000-01-01");
    const data = ok(parseForm(settingsSchema, form));
    expect(Object.keys(data.settings)).not.toContain("id");
    expect(Object.keys(data.settings)).not.toContain("created_at");
    expect(Object.keys(data.settings)).toHaveLength(12);
  });

  describe("phone and WhatsApp numbers", () => {
    it("accept digits, spaces, +, - and parentheses", () => {
      for (const phone of ["+91 98765 43210", "(020) 2567-1234", "+971-4-123-4567", "0 20 2567 1234", "12345"]) {
        expect(ok(parseForm(settingsSchema, settingsForm({ india_phone: phone }))).settings.india_phone, phone).toBe(phone);
      }
    });

    it("refuse letters and other characters", () => {
      for (const phone of ["call me", "98765x43210", "+91 98765 43210 ext 5", "98765.43210", "<b>1</b>2345", "tel:+9198765"]) {
        expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_phone: phone }))), phone).toEqual({ india_phone: PHONE_MESSAGE });
      }
    });

    it("refuse a number with too few or too many digits", () => {
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_phone: "+9 1" })))).toEqual({ uae_phone: PHONE_MESSAGE });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_phone: "1".repeat(21) })))).toEqual({ uae_phone: PHONE_MESSAGE });
    });

    it("need a WhatsApp number to be 8 to 15 digits, which is what the wa.me link needs", () => {
      expect(ok(parseForm(settingsSchema, settingsForm({ india_whatsapp: "+91 98765 43210" }))).settings.india_whatsapp).toBe("+91 98765 43210");
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_whatsapp: "12345" })))).toEqual({ india_whatsapp: WHATSAPP_MESSAGE });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_whatsapp: "1".repeat(16) })))).toEqual({ uae_whatsapp: WHATSAPP_MESSAGE });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_whatsapp: "whatsapp me" })))).toEqual({ uae_whatsapp: WHATSAPP_MESSAGE });
    });

    it("cap the length", () => {
      const long = `+${"1 ".repeat(30)}`;
      expect(parseForm(settingsSchema, settingsForm({ india_phone: long })).ok).toBe(false);
    });

    it("may be left blank", () => {
      const data = ok(parseForm(settingsSchema, settingsForm({ india_phone: "", uae_whatsapp: "  " })));
      expect(data.settings.india_phone).toBe("");
      expect(data.settings.uae_whatsapp).toBe("");
    });
  });

  describe("[bracketed] placeholders (R6)", () => {
    it("are accepted unchanged in the office contact fields, so saving the seeded form works", () => {
      const placeholders = {
        india_phone: "[India phone]",
        india_whatsapp: "[India WhatsApp]",
        india_email: "[India email]",
        india_address: "[India address]",
        uae_phone: "[UAE phone]",
        uae_whatsapp: "[UAE WhatsApp]",
        uae_email: "[UAE email]",
        uae_address: "[UAE address]",
      };
      const data = ok(parseForm(settingsSchema, settingsForm(placeholders)));
      expect(data.settings).toMatchObject(placeholders);
    });

    it("do not count as a quote recipient: a recipient must be a real address", () => {
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_recipient: "[India email]" })))).toEqual({
        india_recipient: RECIPIENT_MESSAGE,
      });
    });

    it("must still be one short bracketed phrase: brackets around markup or a long text are not a placeholder", () => {
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_phone: "[<b>x</b>]" })))).toEqual({ india_phone: PHONE_MESSAGE });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_phone: `[${"x".repeat(80)}]` })))).toEqual({ india_phone: PHONE_MESSAGE });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_email: "[a] b@c.example" })))).toEqual({ india_email: EMAIL_MESSAGE });
    });
  });

  describe("emails", () => {
    it("accept ordinary addresses for the public offices and the recipients", () => {
      const data = ok(
        parseForm(settingsSchema, settingsForm({ india_email: "sales+india@example.co.in", uae_recipient: "Quotes.UAE@Example.com" })),
      );
      expect(data.settings.india_email).toBe("sales+india@example.co.in");
      expect(data.recipients.AE).toBe("Quotes.UAE@Example.com");
    });

    it("refuse a public office email that is not an address", () => {
      for (const email of ["not-an-email", "a@b", "a b@example.com", "a@example.com, b@example.com", "mailto:a@example.com", "<a@example.com>"]) {
        expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_email: email }))), email).toEqual({ uae_email: EMAIL_MESSAGE });
      }
    });

    it("refuse a recipient that is not a single address", () => {
      for (const email of ["not-an-email", "a@b", "a@example.com, b@example.com", "a@example.com;b@example.com", "x@y.example\r\nBcc: evil@example.com"]) {
        expect(errorsOf(parseForm(settingsSchema, settingsForm({ india_recipient: email }))), email).toEqual({
          india_recipient: RECIPIENT_MESSAGE,
        });
      }
    });

    it("cap the length at 254 characters", () => {
      const tooLong = `${"a".repeat(250)}@example.com`;
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_recipient: tooLong })))).toEqual({ uae_recipient: RECIPIENT_MESSAGE });
    });
  });

  describe("text limits", () => {
    it("name the field that is too long", () => {
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ tagline: "x".repeat(201) })))).toEqual({
        tagline: "Tagline must be 200 characters or fewer",
      });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ hero_title: "x".repeat(201) })))).toEqual({
        hero_title: "Home page title must be 200 characters or fewer",
      });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ hero_text: "x".repeat(1001) })))).toEqual({
        hero_text: "Home page text must be 1000 characters or fewer",
      });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ about_md: "x".repeat(20001) })))).toEqual({
        about_md: "About text must be 20000 characters or fewer",
      });
      expect(errorsOf(parseForm(settingsSchema, settingsForm({ uae_address: "x".repeat(501) })))).toEqual({
        uae_address: "UAE address must be 500 characters or fewer",
      });
    });

    it("keeps raw HTML as text: nothing is stripped or rewritten here (rendering escapes it)", () => {
      const data = ok(parseForm(settingsSchema, settingsForm({ tagline: "<b>Bold</b> & more" })));
      expect(data.settings.tagline).toBe("<b>Bold</b> & more");
    });
  });

  it("reports one message per field, so several mistakes show together", () => {
    const errors = errorsOf(
      parseForm(settingsSchema, settingsForm({ india_phone: "abc", uae_email: "nope", india_recipient: "also nope" })),
    );
    expect(errors).toEqual({ india_phone: PHONE_MESSAGE, uae_email: EMAIL_MESSAGE, india_recipient: RECIPIENT_MESSAGE });
  });
});
