import { env } from "@/lib/env";
import { getNavVisibility, getSiteSettings } from "@/lib/content/queries";
import { Footer } from "./Footer";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { Header } from "./Header";
import { QuoteFab } from "./QuoteFab";
import { ScrollReveal } from "./ScrollReveal";

/**
 * What every public page sits in: skip link, header, the page, footer and the floating quote button,
 * the scroll animations, plus the Google Analytics tag when a Measurement ID is set (so the admin area never loads it).
 */
export async function SiteFrame({ children }: { children: React.ReactNode }) {
  const [settings, nav] = await Promise.all([getSiteSettings(), getNavVisibility()]);
  const gaId = env.GA_MEASUREMENT_ID;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Header nav={nav} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer settings={settings} nav={nav} />
      <QuoteFab />
      <ScrollReveal />
      {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
    </div>
  );
}
