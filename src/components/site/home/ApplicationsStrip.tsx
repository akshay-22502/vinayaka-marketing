import Link from "next/link";
import type { Application } from "@/lib/content/types";
import { ApplicationCard } from "../ApplicationCard";
import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

const SHOWN = 6;

/** The first few applications, with a link to all of them. */
export function ApplicationsStrip({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;
  return (
    <section aria-labelledby="applications-heading" className="bg-slate-50 py-14 sm:py-20">
      <div className="container-page">
        <div {...revealProps()}>
          <SectionHeading
            id="applications-heading"
            eyebrow="Applications"
            title="Where our products are used"
            intro="From road bases to landfill liners, see which products suit your project."
          />
        </div>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {applications.slice(0, SHOWN).map((application, index) => (
            <li key={application.slug} {...revealProps(index)}>
              <ApplicationCard application={application} />
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
