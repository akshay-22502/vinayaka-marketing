import Script from "next/script";

/**
 * The Google Analytics 4 tag (gtag.js). SiteFrame renders it, so it is on public pages only and
 * never in the admin area. Page views on client-side navigations are counted by GA4's enhanced
 * measurement ("page changes based on browser history events", on by default).
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  // The ID is checked against /^G-[A-Z0-9]{4,}$/ in env.ts, so it is safe to put in the inline script.
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${measurementId}');`}
      </Script>
    </>
  );
}
