import type { Metadata } from "next";
import { cache } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { ApplicationsStrip } from "@/components/site/home/ApplicationsStrip";
import { CertificationsStrip } from "@/components/site/home/CertificationsStrip";
import { ClosingCta } from "@/components/site/home/ClosingCta";
import { Presence } from "@/components/site/home/Presence";
import { ProductLines } from "@/components/site/home/ProductLines";
import { ProjectsStrip } from "@/components/site/home/ProjectsStrip";
import { ScrollHero } from "@/components/site/home/ScrollHero";
import { Statement } from "@/components/site/home/Statement";
import { WhyUs } from "@/components/site/home/WhyUs";
import {
  getApplications,
  getCategories,
  getCertifications,
  getProjects,
  getSiteSettings,
} from "@/lib/content/queries";
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
      <ScrollHero tagline={settings.tagline} title={settings.heroTitle} text={settings.heroText} />
      <ProductLines categories={categories} />
      <Statement />
      <ApplicationsStrip applications={applications} />
      <WhyUs />
      <CertificationsStrip certifications={certifications} />
      <ProjectsStrip projects={projects} />
      <Presence settings={settings} />
      <ClosingCta />
    </>
  );
}
