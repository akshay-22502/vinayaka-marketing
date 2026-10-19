import { describe, expect, it } from "vitest";
import { ATTACHMENT_MAX_BYTES, quoteSchema, validateAttachment } from "@/lib/quote/schema";
import { fakeFile } from "../support/quote-form";

const valid = {
  name: "Asha Verma",
  email: "asha@verma-infra.example",
  phone: "+91 98765 43210",
  country: "IN",
  message: "Please quote for a road base reinforcement project.",
};

function errorFields(input: unknown): string[] {
  const result = quoteSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => String(issue.path[0]));
}

describe("quoteSchema", () => {
  it("accepts the required fields alone and trims them", () => {
    const result = quoteSchema.parse({ ...valid, name: "  Asha Verma  ", products: [] });
    expect(result.name).toBe("Asha Verma");
    expect(result.company).toBeUndefined();
    expect(result.quantity).toBeUndefined();
    expect(result.projectLocation).toBeUndefined();
    expect(result.products).toEqual([]);
    expect(result.turnstileToken).toBe("");
  });

  it("turns blank optional fields into undefined and keeps filled ones trimmed", () => {
    const result = quoteSchema.parse({
      ...valid,
      company: "  ",
      quantity: " 5,000 m2 ",
      projectLocation: "",
    });
    expect(result.company).toBeUndefined();
    expect(result.quantity).toBe("5,000 m2");
    expect(result.projectLocation).toBeUndefined();
  });

  it("requires a valid email", () => {
    expect(errorFields({ ...valid, email: "" })).toEqual(["email"]);
    expect(errorFields({ ...valid, email: "not-an-email" })).toEqual(["email"]);
    expect(errorFields({ ...valid, email: "a@b.example\r\nBcc: x@y.example" })).toEqual(["email"]);
  });

  it("requires name, phone and message to be at least 2 characters after trimming", () => {
    expect(errorFields({ ...valid, name: " a " })).toEqual(["name"]);
    expect(errorFields({ ...valid, phone: "" })).toEqual(["phone"]);
    expect(errorFields({ ...valid, message: "  x" })).toEqual(["message"]);
    expect(quoteSchema.safeParse({ ...valid, name: "Jo" }).success).toBe(true);
  });

  it("limits the message to 5000 characters", () => {
    expect(quoteSchema.safeParse({ ...valid, message: "m".repeat(5000) }).success).toBe(true);
    expect(errorFields({ ...valid, message: "m".repeat(5001) })).toEqual(["message"]);
  });

  it("accepts only IN or AE as the country", () => {
    expect(quoteSchema.safeParse({ ...valid, country: "AE" }).success).toBe(true);
    expect(errorFields({ ...valid, country: "US" })).toEqual(["country"]);
    expect(errorFields({ ...valid, country: "" })).toEqual(["country"]);
    expect(errorFields({ ...valid, country: "in" })).toEqual(["country"]);
  });

  it("allows up to 20 product slugs, drops blanks and repeats, and rejects more", () => {
    const slugs = Array.from({ length: 20 }, (_, i) => `product-${i}`);
    expect(quoteSchema.parse({ ...valid, products: slugs }).products).toHaveLength(20);
    expect(errorFields({ ...valid, products: [...slugs, "one-more"] })).toEqual(["products"]);
    expect(quoteSchema.parse({ ...valid, products: ["a", " a ", "", "b"] }).products).toEqual(["a", "b"]);
  });

  it("ignores fields it does not know, such as a recipient", () => {
    const result = quoteSchema.parse({ ...valid, to: "attacker@evil.example" });
    expect(result).not.toHaveProperty("to");
  });
});

describe("validateAttachment", () => {
  it("accepts no file", () => {
    expect(validateAttachment(null)).toBeNull();
  });

  it("accepts PDF, JPG, JPEG, PNG and DWG files", () => {
    expect(validateAttachment(fakeFile("drawing.pdf", 1000, "application/pdf"))).toBeNull();
    expect(validateAttachment(fakeFile("site.JPG", 1000, "image/jpeg"))).toBeNull();
    expect(validateAttachment(fakeFile("site.jpeg", 1000, "image/jpeg"))).toBeNull();
    expect(validateAttachment(fakeFile("plan.png", 1000, "image/png"))).toBeNull();
    expect(validateAttachment(fakeFile("layout.dwg", 1000, "application/acad"))).toBeNull();
  });

  it("accepts a file whose browser-reported type is blank or generic", () => {
    expect(validateAttachment(fakeFile("layout.dwg", 1000, ""))).toBeNull();
    expect(validateAttachment(fakeFile("layout.dwg", 1000, "application/octet-stream"))).toBeNull();
    expect(validateAttachment(fakeFile("scan.pdf", 1000, "application/octet-stream"))).toBeNull();
  });

  it("accepts exactly 4 MB and rejects anything larger", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(validateAttachment(fakeFile("a.pdf", ATTACHMENT_MAX_BYTES))).toBeNull();
    expect(validateAttachment(fakeFile("a.pdf", ATTACHMENT_MAX_BYTES + 1))).toMatch(/4 MB/);
    expect(validateAttachment(fakeFile("a.pdf", 5 * 1024 * 1024))).toMatch(/4 MB/);
  });

  it("rejects other file types, including a double extension ending in a bad one", () => {
    expect(validateAttachment(fakeFile("virus.exe", 100, "application/x-msdownload"))).toMatch(/PDF, JPG, PNG or DWG/);
    expect(validateAttachment(fakeFile("report.pdf.exe", 100, "application/pdf"))).toMatch(/PDF, JPG, PNG or DWG/);
    expect(validateAttachment(fakeFile("notes.txt", 100, "text/plain"))).not.toBeNull();
    expect(validateAttachment(fakeFile("noextension", 100, "application/pdf"))).not.toBeNull();
  });

  it("rejects a file whose reported type contradicts its extension", () => {
    expect(validateAttachment(fakeFile("page.pdf", 100, "text/html"))).not.toBeNull();
    expect(validateAttachment(fakeFile("photo.png", 100, "application/pdf"))).not.toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateAttachment(fakeFile("empty.pdf", 0))).toMatch(/empty/i);
  });
});
