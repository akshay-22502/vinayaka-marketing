import Link from "next/link";
import type { Project } from "@/lib/content/types";
import { APPLICATION_PLACEHOLDER, mediaOr } from "@/lib/media";
import { CoverImage } from "../CoverImage";
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
              <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
                <div className="relative aspect-[16/9] bg-slate-100">
                  <CoverImage
                    src={mediaOr(project.coverImage, APPLICATION_PLACEHOLDER)}
                    alt=""
                    sizes="(min-width: 768px) 33vw, 100vw"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-navy">
                    <Link
                      href={`/projects/${project.slug}`}
                      className="after:absolute after:inset-0"
                    >
                      {project.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{project.location}</p>
                </div>
              </article>
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
