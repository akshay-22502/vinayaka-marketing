import Link from "next/link";
import type { Application } from "@/lib/content/types";
import { APPLICATION_PLACEHOLDER, mediaOr } from "@/lib/media";
import { CoverImage } from "../CoverImage";
import { SectionHeading } from "../SectionHeading";

const SHOWN = 6;

/** The first few applications, with a link to all of them. */
export function ApplicationsStrip({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;
  return (
    <section aria-labelledby="applications-heading" className="bg-slate-50 py-14 sm:py-20">
      <div className="container-page">
        <SectionHeading
          id="applications-heading"
          eyebrow="Applications"
          title="Where our products are used"
          intro="From road bases to landfill liners, see which products suit your project."
        />
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {applications.slice(0, SHOWN).map((application) => (
            <li key={application.slug}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange">
                <div className="relative aspect-[16/9] bg-slate-100">
                  <CoverImage
                    src={mediaOr(application.imagePath, APPLICATION_PLACEHOLDER)}
                    alt=""
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-navy">
                    <Link
                      href={`/applications/${application.slug}`}
                      className="after:absolute after:inset-0"
                    >
                      {application.name}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-2 text-slate-600">{application.summary}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link href="/applications" className="font-semibold text-navy underline underline-offset-4">
            All applications
          </Link>
        </p>
      </div>
    </section>
  );
}
