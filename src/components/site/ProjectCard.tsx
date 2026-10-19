import Link from "next/link";
import type { Project } from "@/lib/content/types";
import { placeLabel } from "@/lib/format";
import { APPLICATION_PLACEHOLDER, mediaOr } from "@/lib/media";
import { CoverImage } from "./CoverImage";

type Props = {
  project: Project;
  /** 2 on pages where the cards are the main content, 3 under a section heading. */
  headingLevel?: 2 | 3;
  /** The home page strip shows only the title and place. */
  showSummary?: boolean;
};

/** A project in a listing: first photo (or placeholder), title and place. The whole card is one link. */
export function ProjectCard({ project, headingLevel = 3, showSummary = true }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
      <div className="relative aspect-[16/9] bg-slate-100">
        <CoverImage
          src={mediaOr(project.coverImage, APPLICATION_PLACEHOLDER)}
          alt=""
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>
      <div className="p-5">
        <Heading className="text-lg font-semibold text-navy">
          <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">
            {project.title}
          </Link>
        </Heading>
        <p className="mt-1 text-sm text-slate-600">{placeLabel(project.location, project.country)}</p>
        {showSummary && project.summary ? (
          <p className="mt-3 line-clamp-3 text-slate-600">{project.summary}</p>
        ) : null}
      </div>
    </article>
  );
}
