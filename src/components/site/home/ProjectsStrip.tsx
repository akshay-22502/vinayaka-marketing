import Link from "next/link";
import type { Project } from "@/lib/content/types";
import { ProjectCard } from "../ProjectCard";
import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

const SHOWN = 3;

/** Recent projects. Rendered only when there are published entries. */
export function ProjectsStrip({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <section aria-labelledby="projects-heading" className="py-14 sm:py-20">
      <div className="container-page">
        <div {...revealProps()}>
          <SectionHeading id="projects-heading" eyebrow="Projects" title="Recent projects" />
        </div>
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {projects.slice(0, SHOWN).map((project, index) => (
            <li key={project.slug} {...revealProps(index)}>
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
