import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTurnstile } from "@/components/site/Turnstile";

// Turnstile's own script cannot load in tests, so window.turnstile is a stub that records what the
// form asks of it and lets the test play the part of Cloudflare (calling the callbacks).

type Options = Record<string, unknown> & {
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function setup(width = 340) {
  const rendered: { element: unknown; options: Options }[] = [];
  const api = {
    render: vi.fn((element: unknown, options: Options) => {
      rendered.push({ element, options });
      return "widget-1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal("window", { turnstile: api });

  // The hidden input Turnstile adds to the form.
  const input = { value: "tok-123" };
  const form = { querySelector: vi.fn(() => input) };
  const element = { clientWidth: width, closest: vi.fn(() => form) } as unknown as HTMLElement;
  return { api, rendered, input, form, element };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("mountTurnstile", () => {
  it("does nothing while Cloudflare's script has not loaded", () => {
    vi.stubGlobal("window", {});
    const element = { clientWidth: 340, closest: () => null } as unknown as HTMLElement;
    expect(mountTurnstile(element, "site-key", {})).toBeNull();
  });

  it("renders the widget into the element with the site key", () => {
    const { api, element, rendered } = setup();
    expect(mountTurnstile(element, "site-key", {})).not.toBeNull();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(rendered[0]!.element).toBe(element);
    expect(rendered[0]!.options).toMatchObject({ sitekey: "site-key", theme: "light", size: "normal" });
  });

  it("uses the compact widget in a container narrower than 300px, and the normal one before it is measured", () => {
    const narrow = setup(280);
    mountTurnstile(narrow.element, "k", {});
    expect(narrow.rendered[0]!.options.size).toBe("compact");

    const unmeasured = setup(0);
    mountTurnstile(unmeasured.element, "k", {});
    expect(unmeasured.rendered[0]!.options.size).toBe("normal");
  });

  it("reset() asks Cloudflare for a fresh token for this widget", () => {
    const { api, element } = setup();
    const widget = mountTurnstile(element, "k", {})!;
    widget.reset();
    expect(api.reset).toHaveBeenCalledTimes(1);
    expect(api.reset).toHaveBeenCalledWith("widget-1");
  });

  it("remove() removes the widget once, and reset() after that does nothing", () => {
    const { api, element } = setup();
    const widget = mountTurnstile(element, "k", {})!;
    widget.remove();
    widget.remove();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith("widget-1");
    widget.reset();
    expect(api.reset).not.toHaveBeenCalled();
  });

  it("passes a new token to onToken", () => {
    const { element, rendered } = setup();
    const onToken = vi.fn();
    mountTurnstile(element, "k", { onToken });
    rendered[0]!.options.callback("fresh-token");
    expect(onToken).toHaveBeenCalledWith("fresh-token");
  });

  it("clears the token in the form and tells the form when the token expires", () => {
    const { element, rendered, input, form } = setup();
    const onExpired = vi.fn();
    mountTurnstile(element, "k", { onExpired });
    rendered[0]!.options["expired-callback"]();
    expect(form.querySelector).toHaveBeenCalledWith('input[name="cf-turnstile-response"]');
    expect(input.value).toBe("");
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("clears the token in the form and tells the form when the widget fails", () => {
    const { element, rendered, input } = setup();
    const onError = vi.fn();
    mountTurnstile(element, "k", { onError });
    rendered[0]!.options["error-callback"]();
    expect(input.value).toBe("");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("calls the latest handlers, so a form that re-rendered is not talking to a stale one", () => {
    const { element, rendered } = setup();
    const first = vi.fn();
    const second = vi.fn();
    let current = { onToken: first };
    mountTurnstile(element, "k", () => current);
    current = { onToken: second };
    rendered[0]!.options.callback("t");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("t");
  });
});
