import Link from "next/link";
import type { Project } from "@/lib/content/types";
import { ProjectCard } from "../ProjectCard";
import { SectionHeading } from "../SectionHeading";

const SHOWN = 3;

/** Recent projects. Rendered only when there are published entries. */
export function ProjectsStrip({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <section aria-labelledby="projects-heading" className="py-14 sm:py-20">
      <div className="container-page">
        <SectionHeading id="projects-heading" eyebrow="Projects" title="Recent projects" />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {projects.slice(0, SHOWN).map((project) => (
            <li key={project.slug}>
              <ProjectCard project={project} showSummary={false} />
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link href="/projects" className="font-semibold text-navy underline underline-offset-4">
            All projects
          </Link>
        </p>
      </div>
    </section>
  );
}
