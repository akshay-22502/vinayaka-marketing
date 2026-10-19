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
    options: { sitekey: string; theme?: "light" | "dark" | "auto"; size?: "normal" | "compact" },
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

export type TurnstileHandle = {
  /** Asks for a fresh token. A token works once, so call this after every attempt that used it. */
  reset(): void;
};

export function Turnstile({ siteKey, ref }: { siteKey: string; ref?: Ref<TurnstileHandle> }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
      },
    }),
    [],
  );

  // Safe to call any number of times: it renders once per mounted container.
  const render = useCallback(() => {
    const element = container.current;
    const api = window.turnstile;
    if (!element || !api || widgetId.current !== null) return;
    widgetId.current = api.render(element, {
      sitekey: siteKey,
      theme: "light",
      size: element.clientWidth > 0 && element.clientWidth < NORMAL_WIDTH ? "compact" : "normal",
    });
  }, [siteKey]);

  useEffect(() => {
    // The script may already be on the page (client-side navigation); otherwise onReady renders.
    render();
    return () => {
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onReady={render} />
      <div ref={container} data-testid="turnstile" className="min-h-[65px]" />
    </>
  );
}
