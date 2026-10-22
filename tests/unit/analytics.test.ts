import { afterEach, describe, expect, it, vi } from "vitest";
import { QUOTE_REQUEST_EVENT, trackQuoteRequest } from "@/lib/analytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trackQuoteRequest", () => {
  it("sends generate_lead with the country and product count only", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackQuoteRequest("IN", 3);
    expect(QUOTE_REQUEST_EVENT).toBe("generate_lead");
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "generate_lead", {
      form_name: "quote_request",
      country: "IN",
      product_count: 3,
    });
  });

  it("does nothing when the tag is not loaded", () => {
    vi.stubGlobal("window", {});
    expect(() => trackQuoteRequest("AE", 0)).not.toThrow();
  });

  it("does nothing on the server", () => {
    expect(typeof window).toBe("undefined");
    expect(() => trackQuoteRequest("AE", 0)).not.toThrow();
  });
});
