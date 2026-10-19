import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as emails from "@/lib/quote/emails";
import { handleQuote, type QuoteDeps } from "@/lib/quote/handle";
import { hashIp } from "@/lib/quote/ip";
import type { Mailer } from "@/lib/quote/mailer";
import type { QuoteStore } from "@/lib/quote/store";
import type { Country } from "@/lib/content/types";
import { fakeFile, quoteForm } from "../support/quote-form";

// Wraps the renderers in spies that call the real ones, so a test can make one throw.
vi.mock("@/lib/quote/emails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quote/emails")>();
  return {
    ...actual,
    renderTeamEmail: vi.fn(actual.renderTeamEmail),
    renderBuyerEmail: vi.fn(actual.renderBuyerEmail),
  };
});

const IP = "203.0.113.7";
const SALT = "test-salt";
const NOW = new Date("2026-10-19T10:00:00.000Z");
const QUOTE_ID = "11111111-2222-3333-4444-555555555555";
const RECIPIENTS: Record<Country, string | null> = {
  IN: "india-sales@terratechbharat.example",
  AE: "uae-sales@terratechbharat.example",
};
const PRODUCT_NAMES: Record<string, string> = {
  "pp-biaxial-geogrid": "PP Biaxial Geogrid",
  "hdpe-geomembrane": "HDPE Geomembrane",
};

type Overrides = {
  store?: Partial<QuoteStore>;
  mailer?: Partial<Mailer>;
  verifyCaptcha?: QuoteDeps["verifyCaptcha"];
  recipients?: Partial<Record<Country, string | null>>;
};

/** Fake dependencies that record every call, in order, in `calls`. */
function setup(overrides: Overrides = {}) {
  const calls: string[] = [];
  const recipients = { ...RECIPIENTS, ...overrides.recipients };
  const store: QuoteStore = {
    countSince: vi.fn(async () => {
      calls.push("countSince");
      return 0;
    }),
    insert: vi.fn(async () => {
      calls.push("insert");
      return { id: QUOTE_ID };
    }),
    uploadAttachment: vi.fn(async (file: File) => {
      calls.push("upload");
      return `2026-10/uuid-${file.name}`;
    }),
    recipientFor: vi.fn(async (country: Country) => {
      calls.push("recipientFor");
      return recipients[country];
    }),
    knownProductSlugs: vi.fn(async (slugs: string[]) => slugs.filter((s) => s in PRODUCT_NAMES)),
    productNames: vi.fn(async (slugs: string[]) =>
      slugs.filter((s) => s in PRODUCT_NAMES).map((s) => PRODUCT_NAMES[s]!),
    ),
    markEmailSent: vi.fn(async () => {
      calls.push("markEmailSent");
    }),
    ...overrides.store,
  };
  const mailer: Mailer = {
    send: vi.fn(async () => {
      calls.push("send");
    }),
    ...overrides.mailer,
  };
  const verifyCaptcha = overrides.verifyCaptcha ?? vi.fn(async () => true);
  const deps: QuoteDeps = { store, mailer, verifyCaptcha, salt: SALT, now: () => NOW };
  return { deps, store, mailer, verifyCaptcha: verifyCaptcha as ReturnType<typeof vi.fn>, calls };
}

type SendArgs = Parameters<Mailer["send"]>[0];
const sent = (mailer: Mailer): SendArgs[] =>
  (mailer.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as SendArgs);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleQuote: the happy path", () => {
  it("saves the request and returns 200 with its id and the team", async () => {
    const { deps, store } = setup();
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, id: QUOTE_ID, team: "IN" });
    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(store.insert).toHaveBeenCalledWith({
      name: "Asha Verma",
      company: "Verma Infra",
      email: "asha@verma-infra.example",
      phone: "+91 98765 43210",
      country: "IN",
      products: ["pp-biaxial-geogrid"],
      quantity: "5,000 m2",
      projectLocation: "Pune, Maharashtra",
      message: "Please quote for a road base reinforcement project.",
      attachmentPath: null,
      ipHash: hashIp(IP, SALT),
    });
  });

  it("names the UAE team for a UAE request", async () => {
    const { deps } = setup();
    const result = await handleQuote(quoteForm({ country: "AE" }), IP, deps);
    expect(result.body).toMatchObject({ ok: true, team: "AE" });
  });

  it("stores blank optional fields as null", async () => {
    const { deps, store } = setup();
    await handleQuote(
      quoteForm({ company: "", quantity: null, projectLocation: "  ", products: [] }),
      IP,
      deps,
    );
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ company: null, quantity: null, projectLocation: null, products: [] }),
    );
  });

  it("passes the Turnstile token (from cf-turnstile-response) and the ip to the captcha check", async () => {
    const { deps, verifyCaptcha } = setup();
    await handleQuote(quoteForm({ "cf-turnstile-response": "token-123" }), IP, deps);
    expect(verifyCaptcha).toHaveBeenCalledWith("token-123", IP);
  });

  it("emails the team at the country's recipient with reply-to the buyer, then the buyer", async () => {
    const { deps, mailer, store } = setup();
    await handleQuote(quoteForm({ products: ["pp-biaxial-geogrid", "hdpe-geomembrane"] }), IP, deps);

    const [team, buyer] = sent(mailer);
    expect(sent(mailer)).toHaveLength(2);
    expect(team!.to).toBe(RECIPIENTS.IN);
    expect(team!.replyTo).toBe("asha@verma-infra.example");
    expect(team!.subject).toBe("New quote request (India): Asha Verma");
    expect(team!.html).toContain(QUOTE_ID);
    expect(team!.html).toContain("PP Biaxial Geogrid");
    expect(team!.html).toContain("HDPE Geomembrane");
    expect(buyer!.to).toBe("asha@verma-infra.example");
    expect(buyer!.html).toContain("India team");
    expect(store.markEmailSent).toHaveBeenCalledWith(QUOTE_ID);
  });

  it("routes a UAE request to the UAE recipient", async () => {
    const { deps, mailer, store } = setup();
    await handleQuote(quoteForm({ country: "AE" }), IP, deps);
    expect(store.recipientFor).toHaveBeenCalledWith("AE");
    expect(sent(mailer)[0]!.to).toBe(RECIPIENTS.AE);
    expect(sent(mailer)[0]!.subject).toContain("(UAE)");
  });
});

describe("handleQuote: validation (400)", () => {
  it("rejects a missing email with errors.email, before the captcha or the database", async () => {
    const { deps, store, verifyCaptcha } = setup();
    const result = await handleQuote(quoteForm({ email: null }), IP, deps);

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(result.body.errors).toHaveProperty("email");
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(store.countSince).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports every invalid field at once", async () => {
    const { deps } = setup();
    const result = await handleQuote(quoteForm({ name: "", phone: "", message: "", country: "XX" }), IP, deps);
    expect(result.status).toBe(400);
    expect(Object.keys(result.body.errors ?? {}).sort()).toEqual(["country", "message", "name", "phone"]);
  });

  it("rejects an oversized (5 MB) attachment with errors.attachment", async () => {
    const { deps, store } = setup();
    const result = await handleQuote(
      quoteForm({ attachment: fakeFile("big.pdf", 5 * 1024 * 1024) }),
      IP,
      deps,
    );
    expect(result.status).toBe(400);
    expect(result.body.errors).toHaveProperty("attachment");
    expect(store.uploadAttachment).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("rejects an .exe attachment", async () => {
    const { deps, store } = setup();
    const result = await handleQuote(
      quoteForm({ attachment: fakeFile("setup.exe", 1000, "application/x-msdownload") }),
      IP,
      deps,
    );
    expect(result.status).toBe(400);
    expect(result.body.errors).toHaveProperty("attachment");
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("rejects attachment names that match inherited Object properties, as 400 and never a throw", async () => {
    const { deps, store } = setup();
    for (const [name, type] of [
      ["evil.constructor", "application/octet-stream"],
      ["evil.__proto__", ""],
      ["evil.constructor", "text/html"],
      ["evil.toString", "application/pdf"],
    ] as const) {
      const result = await handleQuote(quoteForm({ attachment: fakeFile(name, 100, type) }), IP, deps);
      expect(result.status, `${name} as "${type}"`).toBe(400);
      expect(result.body.errors).toHaveProperty("attachment");
    }
    expect(store.uploadAttachment).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports an attachment problem together with field problems", async () => {
    const { deps } = setup();
    const result = await handleQuote(
      quoteForm({ email: "nope", attachment: fakeFile("setup.exe", 10, "application/x-msdownload") }),
      IP,
      deps,
    );
    expect(Object.keys(result.body.errors ?? {}).sort()).toEqual(["attachment", "email"]);
  });

  it("treats the empty file part a browser sends for an untouched file input as no attachment", async () => {
    const { deps, store } = setup();
    const result = await handleQuote(
      quoteForm({ attachment: new File([], "", { type: "application/octet-stream" }) }),
      IP,
      deps,
    );
    expect(result.status).toBe(200);
    expect(store.uploadAttachment).not.toHaveBeenCalled();
  });

  it("rejects more than 20 products", async () => {
    const { deps } = setup();
    const products = Array.from({ length: 21 }, (_, i) => `product-${i}`);
    const result = await handleQuote(quoteForm({ products }), IP, deps);
    expect(result.status).toBe(400);
    expect(result.body.errors).toHaveProperty("products");
  });
});

describe("handleQuote: captcha (403)", () => {
  it("returns 403 and never inserts when the captcha fails", async () => {
    const { deps, store, mailer } = setup({ verifyCaptcha: vi.fn(async () => false) });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(403);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toBeTruthy();
    expect(store.insert).not.toHaveBeenCalled();
    expect(store.uploadAttachment).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("returns 403 when no token was sent and the verifier rejects it", async () => {
    const { deps, verifyCaptcha } = setup({ verifyCaptcha: vi.fn(async (token: string) => token !== "") });
    const result = await handleQuote(quoteForm({ "cf-turnstile-response": null }), IP, deps);
    expect(verifyCaptcha).toHaveBeenCalledWith("", IP);
    expect(result.status).toBe(403);
  });
});

describe("handleQuote: rate limit (429)", () => {
  it("returns 429 when the ip hash already has 5 requests in the last hour", async () => {
    const { deps, store } = setup({ store: { countSince: vi.fn(async () => 5) } });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(429);
    expect(result.body.ok).toBe(false);
    expect(store.countSince).toHaveBeenCalledWith(hashIp(IP, SALT), new Date("2026-10-19T09:00:00.000Z"));
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("allows the fifth request (4 already counted) but not the sixth", async () => {
    const four = setup({ store: { countSince: vi.fn(async () => 4) } });
    expect((await handleQuote(quoteForm(), IP, four.deps)).status).toBe(200);
    const six = setup({ store: { countSince: vi.fn(async () => 6) } });
    expect((await handleQuote(quoteForm(), IP, six.deps)).status).toBe(429);
  });

  it("checks the captcha before spending a database read on the rate limit", async () => {
    const { deps, store } = setup({ verifyCaptcha: vi.fn(async () => false) });
    await handleQuote(quoteForm(), IP, deps);
    expect(store.countSince).not.toHaveBeenCalled();
  });
});

describe("handleQuote: insert before email, and email failures", () => {
  it("inserts the row before the first email is sent", async () => {
    const { deps, calls } = setup();
    await handleQuote(quoteForm(), IP, deps);
    expect(calls.indexOf("insert")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("send")).toBeGreaterThan(calls.indexOf("insert"));
  });

  it("uploads the attachment before inserting the row, and stores its path", async () => {
    const { deps, store, calls } = setup();
    const result = await handleQuote(quoteForm({ attachment: fakeFile("plan.pdf", 2000) }), IP, deps);

    expect(result.status).toBe(200);
    expect(calls.indexOf("upload")).toBeLessThan(calls.indexOf("insert"));
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ attachmentPath: "2026-10/uuid-plan.pdf" }));
  });

  it("tells the team about the attachment, with no link", async () => {
    const { deps, mailer } = setup();
    await handleQuote(quoteForm({ attachment: fakeFile("plan.pdf", 2000) }), IP, deps);
    const team = sent(mailer)[0]!;
    expect(team.html).toMatch(/attachment/i);
    expect(team.html).not.toMatch(/https?:\/\//);
  });

  it("returns 200 and keeps the row when the mailer throws; email_sent stays false", async () => {
    const { deps, store } = setup({
      mailer: {
        send: vi.fn(async () => {
          throw new Error("Resend is down");
        }),
      },
    });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(store.markEmailSent).not.toHaveBeenCalled();
  });

  it("still emails the buyer, and does not mark the row, when only the team email fails", async () => {
    const send = vi.fn(async (m: SendArgs) => {
      if (m.to === RECIPIENTS.IN) throw new Error("bounced");
    });
    const { deps, store } = setup({ mailer: { send } });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.markEmailSent).not.toHaveBeenCalled();
  });

  it("marks the row as emailed when the team email works even if the buyer email fails", async () => {
    const send = vi.fn(async (m: SendArgs) => {
      if (m.to === "asha@verma-infra.example") throw new Error("mailbox full");
    });
    const { deps, store } = setup({ mailer: { send } });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(store.markEmailSent).toHaveBeenCalledWith(QUOTE_ID);
  });

  it("returns 200 when markEmailSent itself fails", async () => {
    const { deps } = setup({
      store: {
        markEmailSent: vi.fn(async () => {
          throw new Error("db blip");
        }),
      },
    });
    expect((await handleQuote(quoteForm(), IP, deps)).status).toBe(200);
  });

  it("skips the team email when no recipient is configured, but still emails the buyer", async () => {
    const { deps, mailer, store } = setup({ recipients: { IN: null } });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    const messages = sent(mailer);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.to).toBe("asha@verma-infra.example");
    expect(store.markEmailSent).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("treats a failed recipient lookup like a missing recipient", async () => {
    const { deps, mailer } = setup({
      store: {
        recipientFor: vi.fn(async () => {
          throw new Error("db blip");
        }),
      },
    });
    const result = await handleQuote(quoteForm(), IP, deps);
    expect(result.status).toBe(200);
    expect(sent(mailer)).toHaveLength(1);
  });
});

describe("handleQuote: a failure while building an email cannot fail a saved request", () => {
  afterEach(() => {
    vi.mocked(emails.renderTeamEmail).mockClear();
    vi.mocked(emails.renderBuyerEmail).mockClear();
  });

  it("returns 200 and still emails the buyer when the team email cannot be rendered", async () => {
    vi.mocked(emails.renderTeamEmail).mockImplementationOnce(() => {
      throw new Error("template bug");
    });
    const { deps, mailer, store } = setup();
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, id: QUOTE_ID });
    expect(sent(mailer).map((m) => m.to)).toEqual(["asha@verma-infra.example"]);
    expect(store.markEmailSent).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 200 and keeps email_sent for the team when the buyer email cannot be rendered", async () => {
    vi.mocked(emails.renderBuyerEmail).mockImplementationOnce(() => {
      throw new Error("template bug");
    });
    const { deps, mailer, store } = setup();
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(200);
    expect(sent(mailer).map((m) => m.to)).toEqual([RECIPIENTS.IN]);
    expect(store.markEmailSent).toHaveBeenCalledWith(QUOTE_ID);
  });

  it("returns 200 when neither email can be rendered", async () => {
    vi.mocked(emails.renderTeamEmail).mockImplementationOnce(() => {
      throw new Error("template bug");
    });
    vi.mocked(emails.renderBuyerEmail).mockImplementationOnce(() => {
      throw new Error("template bug");
    });
    const { deps, mailer, store } = setup();
    expect((await handleQuote(quoteForm(), IP, deps)).status).toBe(200);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.markEmailSent).not.toHaveBeenCalled();
  });
});

describe("handleQuote: the buyer email carries only server-controlled text", () => {
  it("does not repeat the buyer's name, message, quantity or location", async () => {
    const { deps, mailer } = setup();
    await handleQuote(
      quoteForm({
        name: "Zed ZORRO-NAME",
        message: "Visit http://evil.example/ZORRO-MESSAGE now",
        quantity: "ZORRO-QUANTITY",
        projectLocation: "ZORRO-LOCATION",
      }),
      IP,
      deps,
    );
    const buyer = sent(mailer)[1]!;
    for (const body of [buyer.subject, buyer.html, buyer.text]) {
      expect(body).not.toContain("ZORRO");
      expect(body).not.toContain("evil.example");
    }
    expect(buyer.html).toContain("11111111");
  });
});

describe("handleQuote: recipients never come from the request", () => {
  it("sends the team email to recipientFor(country) even when the form carries a 'to' field", async () => {
    const { deps, mailer, store } = setup();
    const form = quoteForm();
    form.append("to", "attacker@evil.example");
    form.append("recipient", "attacker@evil.example");
    form.append("cc", "attacker@evil.example");
    form.append("bcc", "attacker@evil.example");
    await handleQuote(form, IP, deps);

    expect(store.recipientFor).toHaveBeenCalledWith("IN");
    const recipients = sent(mailer).map((m) => m.to);
    expect(recipients).toEqual([RECIPIENTS.IN, "asha@verma-infra.example"]);
    expect(JSON.stringify(sent(mailer))).not.toContain("attacker@evil.example");
  });
});

describe("handleQuote: products", () => {
  it("drops unknown slugs without an error, storing and emailing only the known ones", async () => {
    const { deps, store, mailer } = setup();
    const result = await handleQuote(
      quoteForm({ products: ["pp-biaxial-geogrid", "no-such-product", "hdpe-geomembrane"] }),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ products: ["pp-biaxial-geogrid", "hdpe-geomembrane"] }),
    );
    const team = sent(mailer)[0]!;
    expect(team.html).toContain("PP Biaxial Geogrid");
    expect(team.html).not.toContain("no-such-product");
  });

  it("accepts a request where every slug is unknown", async () => {
    const { deps, store } = setup();
    const result = await handleQuote(quoteForm({ products: ["ghost"] }), IP, deps);
    expect(result.status).toBe(200);
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ products: [] }));
  });
});

describe("handleQuote: buyer HTML is escaped in the team email (Review Focus 1)", () => {
  it("escapes a <script> name and an <img onerror> message", async () => {
    const { deps, mailer } = setup();
    await handleQuote(
      quoteForm({
        name: "<script>alert(1)</script>",
        message: "<img src=x onerror=alert(1)>",
      }),
      IP,
      deps,
    );
    const team = sent(mailer)[0]!;
    expect(team.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(team.html).not.toContain("<script");
    expect(team.html).not.toContain("<img");
    expect(sent(mailer)[1]!.html).not.toContain("<script");
  });

  it("keeps CR/LF out of the email subjects", async () => {
    const { deps, mailer } = setup();
    await handleQuote(quoteForm({ name: "Asha\r\nBcc: attacker@evil.example" }), IP, deps);
    for (const m of sent(mailer)) expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("handleQuote: failures (500)", () => {
  it("returns 500 and sends nothing when the insert fails", async () => {
    const { deps, mailer } = setup({
      store: {
        insert: vi.fn(async () => {
          throw new Error("insert failed");
        }),
      },
    });
    const result = await handleQuote(quoteForm(), IP, deps);

    expect(result.status).toBe(500);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toBeTruthy();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 500 and does not insert when the attachment upload fails", async () => {
    const { deps, store, mailer } = setup({
      store: {
        uploadAttachment: vi.fn(async () => {
          throw new Error("storage down");
        }),
      },
    });
    const result = await handleQuote(quoteForm({ attachment: fakeFile("plan.pdf", 2000) }), IP, deps);

    expect(result.status).toBe(500);
    expect(store.insert).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("returns 500 when the rate-limit lookup fails", async () => {
    const { deps, store } = setup({
      store: {
        countSince: vi.fn(async () => {
          throw new Error("db down");
        }),
      },
    });
    const result = await handleQuote(quoteForm(), IP, deps);
    expect(result.status).toBe(500);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("does not leak the underlying error to the buyer", async () => {
    const { deps } = setup({
      store: {
        insert: vi.fn(async () => {
          throw new Error("password authentication failed for user postgres");
        }),
      },
    });
    const result = await handleQuote(quoteForm(), IP, deps);
    expect(JSON.stringify(result.body)).not.toContain("password");
  });
});
