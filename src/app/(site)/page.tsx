import { ApplicationsStrip } from "@/components/site/home/ApplicationsStrip";
import { CategoryTiles } from "@/components/site/home/CategoryTiles";
import { CertificationsStrip } from "@/components/site/home/CertificationsStrip";
import { Hero } from "@/components/site/home/Hero";
import { Presence } from "@/components/site/home/Presence";
import { ProjectsStrip } from "@/components/site/home/ProjectsStrip";
import { WhyUs } from "@/components/site/home/WhyUs";
import { QuoteCta } from "@/components/site/QuoteCta";
import {
  getApplications,
  getCategories,
  getCertifications,
  getProjects,
  getSiteSettings,
} from "@/lib/content/queries";

export const revalidate = 3600;

export default async function HomePage() {
  const [settings, categories, applications, certifications, projects] = await Promise.all([
    getSiteSettings(),
    getCategories(),
    getApplications(),
    getCertifications(),
    getProjects(),
  ]);

  return (
    <>
      <Hero tagline={settings.tagline} title={settings.heroTitle} text={settings.heroText} />
      <CategoryTiles categories={categories} />
      <ApplicationsStrip applications={applications} />
      <WhyUs />
      <CertificationsStrip certifications={certifications} />
      <ProjectsStrip projects={projects} />
      <Presence settings={settings} />
      <div className="container-page py-14 sm:py-20">
        <QuoteCta
          heading="Tell us about your project"
          text="Send your product needs, quantities and delivery location. We reply with recommendations and a quotation."
        />
      </div>
    </>
  );
}
