import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "@/app/api/keep-alive/route";
import { isCronAuthorized } from "@/lib/cron-auth";

// The daily Vercel Cron ping that keeps a free-tier Supabase project from pausing (Ruling R20).
// Vercel Cron calls the path with `Authorization: Bearer <CRON_SECRET>`.

const SECRET = "cron-secret-0123456789abcdef";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({
  getPublicClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({ limit: (count: number) => select(table, columns, count) }),
    }),
  }),
}));

describe("isCronAuthorized", () => {
  it("accepts exactly 'Bearer <secret>'", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized("", SECRET)).toBe(false);
  });

  it("rejects a wrong secret, a prefix of the right one, and another scheme", () => {
    expect(isCronAuthorized("Bearer wrong", SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("rejects everything when the secret is unset or blank, including a header made of that blank", () => {
    for (const secret of [undefined, "", "   "]) {
      for (const header of [null, "", "Bearer", "Bearer ", `Bearer ${secret}`, "Bearer undefined", `Bearer ${SECRET}`]) {
        expect(isCronAuthorized(header, secret), `secret ${JSON.stringify(secret)}, header ${JSON.stringify(header)}`).toBe(false);
      }
    }
  });
});

describe("GET /api/keep-alive", () => {
  function call(authorization?: string): Promise<Response> {
    return GET(
      new Request("http://localhost/api/keep-alive", {
        headers: authorization === undefined ? {} : { authorization },
      }),
    );
  }

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    select.mockReset();
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is never cached or prerendered", async () => {
    expect(dynamic).toBe("force-dynamic");
    const response = await call(`Bearer ${SECRET}`);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("runs one tiny select and answers {ok:true} for the right secret", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("site_settings", "id", 1);
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer wrong"],
    ["the secret without 'Bearer'", SECRET],
  ])("answers 401 and never touches the database with %s", async (_label, header) => {
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(select).not.toHaveBeenCalled();
  });

  it("answers 401 for every request while CRON_SECRET is unset", async () => {
    for (const unset of ["", "  "]) {
      vi.stubEnv("CRON_SECRET", unset);
      for (const header of [undefined, "Bearer ", "Bearer undefined", `Bearer ${unset}`]) {
        expect((await call(header)).status).toBe(401);
      }
    }
    expect(select).not.toHaveBeenCalled();
  });

  it("answers 500 {ok:false} without details when the database refuses, and logs the reason", async () => {
    select.mockResolvedValue({ data: null, error: { message: "JWT expired: secret-detail" } });
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false });
    expect(text).not.toContain("secret-detail");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("secret-detail");
  });

  it("answers 500 {ok:false} without details when the query throws (for example a missing key)", async () => {
    select.mockRejectedValue(new Error("Missing NEXT_PUBLIC_SUPABASE_URL: secret-detail"));
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false });
    expect(text).not.toContain("secret-detail");
  });
});
