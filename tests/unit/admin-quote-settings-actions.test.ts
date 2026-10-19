import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Outcome, type Query } from "../support/fake-supabase";

// updateQuote and saveSettings against a fake Supabase client: that each checks for an admin before
// anything else, what is written, what is revalidated, and how errors come back. The real thing
// (RLS, the browser, the public footer changing) runs in tests/e2e/admin-quotes.spec.ts.

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

const { updateQuote } = await import("@/app/admin/(protected)/quotes/actions");
const { saveSettings } = await import("@/app/admin/(protected)/settings/actions");

const QUOTE_ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";

function fakeSupabase(answer?: (query: Query) => Outcome) {
  const fake = createFakeSupabase({ answer: answer ?? (() => ({ data: [{ id: QUOTE_ID }] })) });
  requireAdmin.mockResolvedValue({ userId: "admin-1", supabase: fake.supabase });
  return fake;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const opNames = (query: Query) => query.ops.map((op) => op.name);
const settingsFields = {
  tagline: "Geosynthetic solutions",
  hero_title: "Reinforce",
  hero_text: "Text",
  about_md: "About",
  india_address: "Pune",
  india_phone: "+91 98765 43210",
  india_whatsapp: "[India WhatsApp]",
  india_email: "[India email]",
  uae_address: "Dubai",
  uae_phone: "[UAE phone]",
  uae_whatsapp: "[UAE WhatsApp]",
  uae_email: "[UAE email]",
  india_recipient: "",
  uae_recipient: "",
};

beforeEach(() => {
  requireAdmin.mockReset();
  revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("every quote and settings action checks for an admin first", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["updateQuote", () => updateQuote(QUOTE_ID, { status: "quoted", adminNotes: "" })],
    ["saveSettings", () => saveSettings(null, form(settingsFields))],
  ];

  it.each(cases)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    const { queries, rpcCalls } = createFakeSupabase({});
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(queries).toEqual([]);
    expect(rpcCalls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateQuote", () => {
  it("saves the status and notes of that quote, and refreshes only the admin quote pages", async () => {
    const { queries } = fakeSupabase();
    await expect(updateQuote(QUOTE_ID, { status: "quoted", adminNotes: "  Sent price list\r\nFollow up Friday " })).resolves.toEqual({
      ok: true,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe("quote_requests");
    expect(opNames(queries[0])).toEqual(["update", "eq", "select"]);
    expect(queries[0].ops[0].args[0]).toEqual({ status: "quoted", admin_notes: "Sent price list\nFollow up Friday" });
    expect(queries[0].ops[1].args).toEqual(["id", QUOTE_ID]);

    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(expect.arrayContaining(["/admin/quotes", `/admin/quotes/${QUOTE_ID}`]));
    // The public site does not show quotes, so it is left alone.
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("stores blank notes as null", async () => {
    const { queries } = fakeSupabase();
    await updateQuote(QUOTE_ID, { status: "closed", adminNotes: "   " });
    expect(queries[0].ops[0].args[0]).toEqual({ status: "closed", admin_notes: null });
  });

  it("writes only the status and the notes, whatever else is sent", async () => {
    const { queries } = fakeSupabase();
    await updateQuote(QUOTE_ID, { status: "new", adminNotes: "", email_sent: true, message: "x", country: "IN", ip_hash: "y" });
    expect(Object.keys(queries[0].ops[0].args[0] as object).sort()).toEqual(["admin_notes", "status"]);
  });

  it("refuses an unknown status without touching the database", async () => {
    const { queries } = fakeSupabase();
    await expect(updateQuote(QUOTE_ID, { status: "won", adminNotes: "" })).resolves.toEqual({
      ok: false,
      errors: { status: "Choose a status" },
    });
    expect(queries).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses notes that are too long", async () => {
    const { queries } = fakeSupabase();
    const result = await updateQuote(QUOTE_ID, { status: "new", adminNotes: "x".repeat(5001) });
    expect(result).toEqual({ ok: false, errors: { adminNotes: "Notes must be 5000 characters or fewer" } });
    expect(queries).toEqual([]);
  });

  it("refuses an id that is not a uuid", async () => {
    const { queries } = fakeSupabase();
    for (const id of ["not-an-id", "", "1; drop table quote_requests", null, undefined, 7, {}]) {
      const result = await updateQuote(id, { status: "new", adminNotes: "" });
      expect(result.ok, String(id)).toBe(false);
    }
    expect(queries).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says so when the quote no longer exists, without refreshing anything", async () => {
    fakeSupabase(() => ({ data: [] }));
    const result = await updateQuote(QUOTE_ID, { status: "new", adminNotes: "" });
    expect(result).toEqual({ ok: false, errors: { form: expect.stringContaining("no longer exists") } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("never shows database text", async () => {
    fakeSupabase(() => ({ error: { code: "XX000", message: 'secret relation "quote_requests" exploded' } }));
    const result = await updateQuote(QUOTE_ID, { status: "new", adminNotes: "" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).toEqual({ ok: false, errors: { form: "Could not save. Please try again." } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveSettings", () => {
  it("returns field errors without touching the database", async () => {
    const { queries } = fakeSupabase();
    const result = await saveSettings(null, form({ ...settingsFields, india_phone: "call me", uae_recipient: "nope" }));
    expect(result.ok).toBe(false);
    expect(result.ok ? {} : result.errors).toEqual({
      india_phone: expect.any(String),
      uae_recipient: expect.any(String),
    });
    expect(queries).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("upserts the single settings row and the recipients that are filled in, and refreshes the whole site", async () => {
    const { queries } = fakeSupabase();
    const result = await saveSettings(
      null,
      form({ ...settingsFields, india_recipient: "india@terratechbharat.example", uae_recipient: "uae@terratechbharat.example" }),
    );
    expect(result).toEqual({ ok: true });

    expect(queries.map((query) => query.table)).toEqual(["site_settings", "quote_recipients"]);
    expect(opNames(queries[0])[0]).toBe("upsert");
    expect(queries[0].ops[0].args[0]).toEqual({
      id: 1,
      tagline: "Geosynthetic solutions",
      hero_title: "Reinforce",
      hero_text: "Text",
      about_md: "About",
      india_address: "Pune",
      india_phone: "+91 98765 43210",
      india_whatsapp: "[India WhatsApp]",
      india_email: "[India email]",
      uae_address: "Dubai",
      uae_phone: "[UAE phone]",
      uae_whatsapp: "[UAE WhatsApp]",
      uae_email: "[UAE email]",
    });

    expect(opNames(queries[1])[0]).toBe("upsert");
    expect(queries[1].ops[0].args[0]).toEqual([
      { country: "IN", email: "india@terratechbharat.example" },
      { country: "AE", email: "uae@terratechbharat.example" },
    ]);
    expect(queries[1].ops[0].args[1]).toEqual({ onConflict: "country" });

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("deletes the row of a country whose recipient is left blank, and keeps the other (R16)", async () => {
    const { queries } = fakeSupabase();
    await saveSettings(null, form({ ...settingsFields, india_recipient: "", uae_recipient: "uae@terratechbharat.example" }));

    const recipientQueries = queries.filter((query) => query.table === "quote_recipients");
    expect(recipientQueries).toHaveLength(2);
    const upsert = recipientQueries.find((query) => opNames(query)[0] === "upsert")!;
    const remove = recipientQueries.find((query) => opNames(query)[0] === "delete")!;
    expect(upsert.ops[0].args[0]).toEqual([{ country: "AE", email: "uae@terratechbharat.example" }]);
    expect(remove.ops.map((op) => [op.name, ...op.args])).toEqual([["delete"], ["in", "country", ["IN"]]]);
  });

  it("deletes both rows when both recipients are blank, without upserting any", async () => {
    const { queries } = fakeSupabase();
    await saveSettings(null, form(settingsFields));
    const recipientQueries = queries.filter((query) => query.table === "quote_recipients");
    expect(recipientQueries).toHaveLength(1);
    expect(opNames(recipientQueries[0])[0]).toBe("delete");
    expect(recipientQueries[0].ops[1].args).toEqual(["country", ["IN", "AE"]]);
  });

  it("writes nothing to the recipients when the settings row could not be saved", async () => {
    const { queries } = fakeSupabase((query) =>
      query.table === "site_settings" ? { error: { code: "XX000", message: "boom internals" } } : { data: [] },
    );
    const result = await saveSettings(null, form({ ...settingsFields, uae_recipient: "uae@terratechbharat.example" }));
    expect(result).toEqual({ ok: false, errors: { form: "Could not save. Please try again." } });
    expect(JSON.stringify(result)).not.toContain("internals");
    expect(queries.map((query) => query.table)).toEqual(["site_settings"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes the site and says which part failed when only the recipients could not be saved", async () => {
    fakeSupabase((query) =>
      query.table === "quote_recipients" ? { error: { code: "42501", message: "permission denied for table quote_recipients" } } : { data: [{ id: 1 }] },
    );
    const result = await saveSettings(null, form({ ...settingsFields, uae_recipient: "uae@terratechbharat.example" }));
    expect(result.ok).toBe(false);
    const message = result.ok ? "" : result.errors.form;
    expect(message).toMatch(/recipient/i);
    expect(message).toMatch(/saved/i);
    expect(message).not.toContain("permission denied");
    // The office details did save, so the public pages must pick them up.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("writes only the settings columns, whatever else is posted", async () => {
    const { queries } = fakeSupabase();
    await saveSettings(null, form({ ...settingsFields, id: "2", created_at: "2000-01-01", email_sent: "true" }));
    expect(Object.keys(queries[0].ops[0].args[0] as object).sort()).toEqual(
      ["id", ...Object.keys(settingsFields).filter((name) => !name.endsWith("_recipient"))].sort(),
    );
    expect((queries[0].ops[0].args[0] as { id: number }).id).toBe(1);
  });
});
