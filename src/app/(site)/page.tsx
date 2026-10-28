import type { Metadata } from "next";
import { cache } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { ApplicationsStrip } from "@/components/site/home/ApplicationsStrip";
import { CategoryTiles } from "@/components/site/home/CategoryTiles";
import { CertificationsStrip } from "@/components/site/home/CertificationsStrip";
import { Hero } from "@/components/site/home/Hero";
import { Presence } from "@/components/site/home/Presence";
import { ProjectsStrip } from "@/components/site/home/ProjectsStrip";
import { WhyUs } from "@/components/site/home/WhyUs";
import { QuoteCta } from "@/components/site/QuoteCta";
import { ScrollReveal } from "@/components/site/ScrollReveal";
import {
  getApplications,
  getCategories,
  getCertifications,
  getProjects,
  getSiteSettings,
} from "@/lib/content/queries";
import { revealProps } from "@/lib/reveal";
import { metaDescription, organizationJsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

const FALLBACK_TAGLINE = "Geosynthetic solutions for India and the UAE";

// Called by both generateMetadata and the page; cache() makes it one query per request.
const loadSettings = cache(getSiteSettings);

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  const tagline = settings.tagline.trim() || FALLBACK_TAGLINE;
  return pageMetadata({
    title: { absolute: `TerraTechBharat | ${tagline}` },
    description: metaDescription(settings.heroText) ?? metaDescription(tagline),
    path: "/",
  });
}

export default async function HomePage() {
  const [settings, categories, applications, certifications, projects] = await Promise.all([
    loadSettings(),
    getCategories(),
    getApplications(),
    getCertifications(),
    getProjects(),
  ]);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <Hero tagline={settings.tagline} title={settings.heroTitle} text={settings.heroText} />
      <CategoryTiles categories={categories} />
      <ApplicationsStrip applications={applications} />
      <WhyUs />
      <CertificationsStrip certifications={certifications} />
      <ProjectsStrip projects={projects} />
      <Presence settings={settings} />
      <div {...revealProps()} className="container-page py-14 sm:py-20">
        <QuoteCta
          heading="Tell us about your project"
          text="Send your product needs, quantities and delivery location. We reply with recommendations and a quotation."
        />
      </div>
      <ScrollReveal />
    </>
  );
}
