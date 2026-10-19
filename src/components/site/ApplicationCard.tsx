import Link from "next/link";
import type { Application } from "@/lib/content/types";
import { APPLICATION_PLACEHOLDER, mediaOr } from "@/lib/media";
import { CoverImage } from "./CoverImage";

type Props = {
  application: Application;
  /** 2 on pages where the cards are the main content, 3 under a section heading. */
  headingLevel?: 2 | 3;
};

/** An application in a listing: photo (or placeholder), name and summary. The whole card is one link. */
export function ApplicationCard({ application, headingLevel = 3 }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
      <div className="relative aspect-[16/9] bg-slate-100">
        <CoverImage
          src={mediaOr(application.imagePath, APPLICATION_PLACEHOLDER)}
          alt=""
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>
      <div className="p-5">
        <Heading className="text-lg font-semibold text-navy">
          <Link href={`/applications/${application.slug}`} className="after:absolute after:inset-0">
            {application.name}
          </Link>
        </Heading>
        <p className="mt-2 line-clamp-3 text-slate-600">{application.summary}</p>
      </div>
    </article>
  );
}
