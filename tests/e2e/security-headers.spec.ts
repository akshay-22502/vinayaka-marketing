import { expect, test } from "@playwright/test";

// next.config.ts sends anti-framing headers on every route; tests/unit/next-config.test.ts checks the
// rules, this checks they reach real responses from the production build.

const ROUTES = ["/", "/products/geogrid/pp-biaxial-geogrid", "/quote", "/admin/login", "/sitemap.xml"];

test.describe("anti-framing headers", () => {
  for (const route of ROUTES) {
    test(`${route} cannot be put in a frame`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
      expect(response.headers()["x-frame-options"]).toBe("DENY");
    });
  }

  test("an unknown page and the quote API carry them too", async ({ request }) => {
    for (const route of ["/no-such-page", "/api/quote"]) {
      const response = await request.get(route);
      expect(response.headers()["content-security-policy"], route).toBe("frame-ancestors 'none'");
      expect(response.headers()["x-frame-options"], route).toBe("DENY");
    }
  });

  test("the admin login keeps its noindex header next to them", async ({ request }) => {
    const response = await request.get("/admin/login");
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("the quote form's Turnstile iframe is ours to embed: the policy restricts framing of us only", async ({ request }) => {
    // frame-ancestors says who may frame this site. It must not be a default-src/frame-src policy
    // that would block the captcha iframe we embed.
    const policy = (await request.get("/quote")).headers()["content-security-policy"];
    expect(policy).not.toMatch(/default-src|frame-src|script-src/);
  });
});

test.describe("/api/keep-alive", () => {
  test("is closed to anyone without the cron secret (the E2E server has none set), and never cached", async ({ request }) => {
    const attempts: Record<string, string>[] = [{}, { authorization: "Bearer guess" }, { authorization: "Bearer undefined" }, { authorization: "Bearer " }];
    for (const headers of attempts) {
      const response = await request.get("/api/keep-alive", { headers });
      expect(response.status(), JSON.stringify(headers)).toBe(401);
      expect(await response.json()).toEqual({ ok: false });
      expect(response.headers()["cache-control"]).toMatch(/no-store/);
    }
  });

  test("is not in the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toContain("keep-alive");
  });
});
