import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// The response headers Next adds. tests/e2e/security-headers.spec.ts checks they reach real pages.

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

async function rules(): Promise<Rule[]> {
  return (await nextConfig.headers?.()) ?? [];
}

describe("next.config headers", () => {
  it("forbids framing the site from any other page, on every route", async () => {
    const all = (await rules()).find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(
      expect.arrayContaining([
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
      ]),
    );
  });

  it("keeps the admin area out of search results (merged with the framing rule, not replaced by it)", async () => {
    const admin = (await rules()).find((rule) => rule.source === "/admin/:path*");
    expect(admin?.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
  });
});
