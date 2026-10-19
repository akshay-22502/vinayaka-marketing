import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/site/ProjectCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getProjects } from "@/lib/content/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Projects",
  description: "Projects in India and the UAE where TerraTechBharat geosynthetics have been supplied.",
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  // Hidden until there is something to show; the header and footer links are hidden too.
  if (projects.length === 0) notFound();

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Projects"
        intro="A selection of projects in India and the UAE where our products are in use."
      />
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <li key={project.slug}>
            <ProjectCard project={project} headingLevel={2} />
          </li>
        ))}
      </ul>
      <div className="mt-16">
        <QuoteCta
          heading="Have a project in mind?"
          text="Tell us about it. We recommend the right products and send a quotation."
        />
      </div>
    </div>
  );
}
