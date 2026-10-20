import { Markdown } from "@/components/site/Markdown";
import { Presence } from "@/components/site/home/Presence";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getSiteSettings } from "@/lib/content/queries";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "About",
  description:
    "TerraTechBharat supplies geogrids, geomembranes, geotextiles and geocells for projects in India and the UAE.",
  path: "/about",
});

export default async function AboutPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <div className="container-page pb-4 pt-12 sm:pt-16">
        <SectionHeading
          level={1}
          eyebrow="About us"
          title="About TerraTechBharat"
          intro={settings.tagline || undefined}
        />
        {settings.aboutMd.trim() !== "" ? (
          <div className="mt-8 min-w-0 max-w-3xl">
            <Markdown topHeading={2}>{settings.aboutMd}</Markdown>
          </div>
        ) : null}
      </div>
      <div className="mt-10">
        <Presence settings={settings} />
      </div>
      <div className="container-page py-14 sm:py-20">
        <QuoteCta
          heading="Tell us about your project"
          text="Send your product needs, quantities and delivery location. We reply with recommendations and a quotation."
        />
      </div>
    </>
  );
}
