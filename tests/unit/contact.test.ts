import { describe, expect, it } from "vitest";
import { isFilledIn, mailtoHref, telHref, whatsappHref } from "@/lib/contact";

describe("isFilledIn", () => {
  it("accepts real values", () => {
    expect(isFilledIn("+91 98765 43210")).toBe(true);
    expect(isFilledIn("sales@terratechbharat.com")).toBe(true);
  });

  it("rejects empty, blank and [bracketed] placeholder values", () => {
    expect(isFilledIn("")).toBe(false);
    expect(isFilledIn("   ")).toBe(false);
    expect(isFilledIn("[India phone]")).toBe(false);
    expect(isFilledIn("  [UAE email]")).toBe(false);
  });
});

describe("telHref", () => {
  it("keeps the leading plus and the digits", () => {
    expect(telHref("+91 98765-43210")).toBe("tel:+919876543210");
    expect(telHref("+971 (4) 123 4567")).toBe("tel:+97141234567");
  });

  it("returns null for placeholders, blanks and values without a usable number", () => {
    expect(telHref("[India phone]")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("call us")).toBeNull();
    expect(telHref("123")).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("builds a mailto link", () => {
    expect(mailtoHref(" sales@terratechbharat.com ")).toBe("mailto:sales@terratechbharat.com");
  });

  it("returns null for placeholders, blanks and malformed addresses", () => {
    expect(mailtoHref("[India email]")).toBeNull();
    expect(mailtoHref("")).toBeNull();
    expect(mailtoHref("not an email")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("builds a wa.me link from digits only", () => {
    expect(whatsappHref("+91 98765 43210")).toBe("https://wa.me/919876543210");
  });

  it("returns null for placeholders, blanks and numbers that are too short or too long", () => {
    expect(whatsappHref("[UAE WhatsApp]")).toBeNull();
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref("12345")).toBeNull();
    expect(whatsappHref("1234567890123456")).toBeNull();
  });
});
