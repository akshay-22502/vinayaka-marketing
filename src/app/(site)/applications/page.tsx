import type { Metadata } from "next";
import { ApplicationCard } from "@/components/site/ApplicationCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getApplications } from "@/lib/content/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Applications",
  description:
    "Where geogrids, geomembranes, geotextiles and geocells are used: roads, slopes, landfills, ponds, erosion control and railways.",
};

export default async function ApplicationsPage() {
  const applications = await getApplications();

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Applications"
        intro="See where geosynthetics are used on site, and which of our products suit each job."
      />
      {applications.length > 0 ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((application) => (
            <li key={application.slug}>
              <ApplicationCard application={application} headingLevel={2} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-slate-600">Applications are being added. Please check back soon.</p>
      )}
      <div className="mt-16">
        <QuoteCta
          heading="Planning a project?"
          text="Tell us about the site and the job. We recommend the right products and send a quotation."
        />
      </div>
    </div>
  );
}
