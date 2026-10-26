import { describe, expect, it } from "vitest";
import {
  FIELD_ORDER,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  checkQuoteForm,
  firstInvalidField,
  interpretQuoteResponse,
  teamName,
  type QuoteFormValues,
} from "@/lib/quote/form-checks";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, validateAttachment } from "@/lib/quote/attachment";
import { quoteSchema } from "@/lib/quote/schema";
import { fakeFile } from "../support/quote-form";

const valid: QuoteFormValues = {
  name: "Asha Verma",
  company: "",
  email: "asha@verma-infra.example",
  phone: "+91 98765 43210",
  country: "IN",
  categories: [],
  quantity: "",
  projectLocation: "",
  message: "Please quote for a road base reinforcement project.",
  attachment: null,
};

describe("checkQuoteForm", () => {
  it("passes a form with only the required fields", () => {
    expect(checkQuoteForm(valid)).toEqual({});
  });

  it("flags every empty required field, with a message that says what to enter", () => {
    const errors = checkQuoteForm({ ...valid, name: "", email: "", phone: "", country: "", message: "" });
    expect(Object.keys(errors).sort()).toEqual(["country", "email", "message", "name", "phone"]);
    expect(errors.email).toBe("Enter your email address");
    expect(errors.country).toBe("Choose India or the UAE");
  });

  it("treats whitespace as empty and wants at least 2 characters", () => {
    expect(Object.keys(checkQuoteForm({ ...valid, name: "   ", phone: " 7 ", message: " x " })).sort()).toEqual([
      "message",
      "name",
      "phone",
    ]);
    expect(checkQuoteForm({ ...valid, name: "Jo" })).toEqual({});
  });

  it("explains an email that is not an address", () => {
    expect(checkQuoteForm({ ...valid, email: "not-an-email" }).email).toBe("Enter a valid email address");
    expect(checkQuoteForm({ ...valid, email: "a@b" }).email).toBe("Enter a valid email address");
    expect(checkQuoteForm({ ...valid, email: " asha@verma-infra.example " })).toEqual({});
  });

  it("accepts only India or the UAE", () => {
    expect(checkQuoteForm({ ...valid, country: "AE" })).toEqual({});
    expect(checkQuoteForm({ ...valid, country: "US" }).country).toBeDefined();
  });

  it("caps lengths like the server does", () => {
    expect(checkQuoteForm({ ...valid, message: "m".repeat(5000) })).toEqual({});
    expect(checkQuoteForm({ ...valid, message: "m".repeat(5001) }).message).toMatch(/5000/);
    expect(checkQuoteForm({ ...valid, name: "n".repeat(201) }).name).toMatch(/200/);
    expect(checkQuoteForm({ ...valid, company: "c".repeat(201) }).company).toMatch(/200/);
    expect(checkQuoteForm({ ...valid, quantity: "q".repeat(201) }).quantity).toMatch(/200/);
    expect(checkQuoteForm({ ...valid, projectLocation: "p".repeat(201) }).projectLocation).toMatch(/200/);
    expect(checkQuoteForm({ ...valid, phone: "1".repeat(51) }).phone).toMatch(/50/);
  });

  it("allows at most 20 categories", () => {
    const slugs = (n: number) => Array.from({ length: n }, (_, i) => `category-${i}`);
    expect(checkQuoteForm({ ...valid, categories: slugs(20) })).toEqual({});
    expect(checkQuoteForm({ ...valid, categories: slugs(21) }).categories).toMatch(/20/);
  });

  it("checks the attachment", () => {
    expect(checkQuoteForm({ ...valid, attachment: fakeFile("plan.pdf", 1000) })).toEqual({});
    expect(checkQuoteForm({ ...valid, attachment: fakeFile("big.pdf", ATTACHMENT_MAX_BYTES + 1) }).attachment).toMatch(
      /4 MB/,
    );
    expect(checkQuoteForm({ ...valid, attachment: fakeFile("run.exe", 100, "application/x-msdownload") }).attachment).toMatch(
      /PDF, JPG, PNG or DWG/,
    );
  });

  // The client check must never be stricter or looser than the server on which fields are wrong,
  // so a form that passes here is not bounced by the server for a reason the visitor was not told.
  describe("agrees with the server schema on which fields are invalid", () => {
    const cases: [string, Partial<QuoteFormValues>][] = [
      ["valid", {}],
      ["empty name", { name: "" }],
      ["one-letter name", { name: "A" }],
      ["blank phone", { phone: "  " }],
      ["no email", { email: "" }],
      ["bad email", { email: "nobody@" }],
      ["email with a newline", { email: "a@b.example\r\nBcc: x@y.example" }],
      ["no country", { country: "" }],
      ["unknown country", { country: "US" }],
      ["short message", { message: "x" }],
      ["message at the limit", { message: "m".repeat(5000) }],
      ["message over the limit", { message: "m".repeat(5001) }],
      ["long company", { company: "c".repeat(201) }],
      ["company at the limit", { company: "c".repeat(200) }],
      ["long quantity", { quantity: "q".repeat(201) }],
      ["long location", { projectLocation: "l".repeat(201) }],
      ["long phone", { phone: "1".repeat(51) }],
      ["long email", { email: `${"e".repeat(250)}@x.example` }],
      ["many things wrong", { name: "", email: "x", phone: "", country: "", message: "" }],
    ];

    for (const [label, override] of cases) {
      it(label, () => {
        const values = { ...valid, ...override };
        const server = quoteSchema.safeParse({ ...values, attachment: undefined });
        const serverFields = server.success ? [] : [...new Set(server.error.issues.map((i) => String(i.path[0])))].sort();
        expect(Object.keys(checkQuoteForm(values)).sort()).toEqual(serverFields);
      });
    }
  });
});

describe("attachment rules shared with the server", () => {
  it("accepts exactly the extensions the server allows", () => {
    expect(ATTACHMENT_ACCEPT).toBe(".pdf,.jpg,.jpeg,.png,.dwg");
    for (const name of ["a.pdf", "a.PDF", "a.jpg", "a.jpeg", "a.png", "a.dwg"]) {
      expect(validateAttachment(fakeFile(name, 10, "")), name).toBeNull();
    }
  });
});

describe("firstInvalidField", () => {
  it("follows the order of the fields on the page, not the order the errors arrived in", () => {
    expect(FIELD_ORDER[0]).toBe("name");
    expect(firstInvalidField({ message: "x", email: "y", attachment: "z" })).toBe("email");
    expect(firstInvalidField({ attachment: "z", categories: "y" })).toBe("categories");
  });

  it("ignores keys that are not fields, and returns null when there are no errors", () => {
    expect(firstInvalidField({})).toBeNull();
    expect(firstInvalidField({ form: "something" })).toBeNull();
    expect(firstInvalidField({ form: "something", phone: "bad" })).toBe("phone");
  });
});

describe("interpretQuoteResponse", () => {
  it("reads the team from a saved request", () => {
    expect(interpretQuoteResponse(200, { ok: true, id: "abc", team: "AE" }, "IN")).toEqual({ kind: "sent", team: "AE" });
  });

  it("falls back to the country that was submitted when the answer names no team", () => {
    expect(interpretQuoteResponse(200, { ok: true, id: "abc" }, "AE")).toEqual({ kind: "sent", team: "AE" });
    expect(interpretQuoteResponse(200, { ok: true, team: "nope" }, "IN")).toEqual({ kind: "sent", team: "IN" });
  });

  it("returns field errors from a 400, and the server's message", () => {
    expect(
      interpretQuoteResponse(
        400,
        { ok: false, message: "Please check the highlighted fields and try again.", errors: { email: "Enter a valid email address" } },
        "IN",
      ),
    ).toEqual({
      kind: "invalid",
      message: "Please check the highlighted fields and try again.",
      errors: { email: "Enter a valid email address" },
    });
  });

  it("keeps only text errors", () => {
    const outcome = interpretQuoteResponse(400, { ok: false, errors: { email: "bad", phone: 3, name: null } }, "IN");
    expect(outcome).toMatchObject({ kind: "invalid", errors: { email: "bad" } });
  });

  it("shows the server's message for 403, 429 and 500", () => {
    for (const status of [403, 429, 500]) {
      expect(interpretQuoteResponse(status, { ok: false, message: `message ${status}` }, "IN")).toEqual({
        kind: "failed",
        message: `message ${status}`,
      });
    }
  });

  it("has a plain message when the answer is not usable", () => {
    expect(interpretQuoteResponse(500, null, "IN")).toEqual({ kind: "failed", message: GENERIC_ERROR_MESSAGE });
    expect(interpretQuoteResponse(502, "<html>Bad gateway</html>", "IN")).toEqual({ kind: "failed", message: GENERIC_ERROR_MESSAGE });
    expect(interpretQuoteResponse(400, { ok: false }, "IN")).toEqual({ kind: "failed", message: GENERIC_ERROR_MESSAGE });
    expect(interpretQuoteResponse(200, { ok: false }, "IN")).toEqual({ kind: "failed", message: GENERIC_ERROR_MESSAGE });
  });

  it("explains a body the host refused as too large", () => {
    const outcome = interpretQuoteResponse(413, null, "IN");
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.message).toMatch(/too large/i);
  });

  it("has a message for a request that never reached the server", () => {
    expect(NETWORK_ERROR_MESSAGE).toMatch(/connection/i);
  });
});

describe("teamName", () => {
  it("names the team for each country", () => {
    expect(teamName("IN")).toBe("India");
    expect(teamName("AE")).toBe("UAE");
  });
});
