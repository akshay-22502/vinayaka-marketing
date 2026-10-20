"use client";

import Script from "next/script";
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

// Cloudflare Turnstile, rendered explicitly. Explicit rendering (not the implicit `.cf-turnstile`
// div) is what keeps it working when a visitor reaches the form by a client-side navigation:
// the api.js script is then already loaded and would not scan the new page for widgets.
// Turnstile adds a hidden `cf-turnstile-response` input to the surrounding <form>, which is the
// field the quote API reads.

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "compact";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** The normal widget is 300px wide; narrower containers (a 320px phone) get the compact one. */
const NORMAL_WIDTH = 300;
const RESPONSE_INPUT = 'input[name="cf-turnstile-response"]';

export type TurnstileHandlers = {
  /** A new token is ready (the check passed, or was redone after a reset or an expiry). */
  onToken?: (token: string) => void;
  /** The token ran out before it was used. Turnstile refreshes it by itself. */
  onExpired?: () => void;
  /** The widget could not run (blocked, offline, bad key). */
  onError?: () => void;
};

export type TurnstileWidget = {
  /** Asks for a fresh token. A token works once, so call this after every attempt that used it. */
  reset(): void;
  remove(): void;
};

/** What the form can ask of the widget. */
export type TurnstileHandle = Pick<TurnstileWidget, "reset">;

/**
 * Renders a widget into `element` through Cloudflare's `window.turnstile`, or returns null when
 * that script has not loaded yet. The handlers may be a function, so the widget always calls the
 * latest ones. A token that expired or failed is wiped from the form, so it cannot be sent.
 */
export function mountTurnstile(
  element: HTMLElement,
  siteKey: string,
  handlers: TurnstileHandlers | (() => TurnstileHandlers),
): TurnstileWidget | null {
  const api = window.turnstile;
  if (!api) return null;

  const current = () => (typeof handlers === "function" ? handlers() : handlers);
  const clearToken = () => {
    const input = element.closest("form")?.querySelector<HTMLInputElement>(RESPONSE_INPUT);
    if (input) input.value = "";
  };

  const id = api.render(element, {
    sitekey: siteKey,
    theme: "light",
    size: element.clientWidth > 0 && element.clientWidth < NORMAL_WIDTH ? "compact" : "normal",
    callback: (token) => current().onToken?.(token),
    "expired-callback": () => {
      clearToken();
      current().onExpired?.();
    },
    "error-callback": () => {
      clearToken();
      current().onError?.();
    },
  });

  let removed = false;
  return {
    reset() {
      if (!removed) api.reset(id);
    },
    remove() {
      if (removed) return;
      removed = true;
      api.remove(id);
    },
  };
}

type Props = TurnstileHandlers & { siteKey: string; ref?: Ref<TurnstileHandle> };

export function Turnstile({ siteKey, ref, onToken, onExpired, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<TurnstileWidget | null>(null);
  const handlers = useRef<TurnstileHandlers>({});

  // Declared before the render effect below, so the handlers are in place when the widget starts.
  useEffect(() => {
    handlers.current = { onToken, onExpired, onError };
  });

  useImperativeHandle(ref, () => ({ reset: () => widget.current?.reset() }), []);

  // Safe to call any number of times: it renders once per mounted container.
  const render = useCallback(() => {
    if (!container.current || widget.current) return;
    widget.current = mountTurnstile(container.current, siteKey, () => handlers.current);
  }, [siteKey]);

  useEffect(() => {
    // The script may already be on the page (client-side navigation); otherwise onReady renders.
    render();
    return () => {
      widget.current?.remove();
      widget.current = null;
    };
  }, [render]);

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onReady={render} />
      <div ref={container} data-testid="turnstile" className="min-h-[65px]" />
    </>
  );
}
