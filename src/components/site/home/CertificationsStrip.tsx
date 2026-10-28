import Link from "next/link";
import type { Certification } from "@/lib/content/types";
import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

/** Certifications held. Rendered only when there are published entries. */
export function CertificationsStrip({ certifications }: { certifications: Certification[] }) {
  if (certifications.length === 0) return null;
  return (
    <section aria-labelledby="certifications-heading" className="bg-slate-50 py-14 sm:py-20">
      <div className="container-page">
        <div {...revealProps()}>
          <SectionHeading id="certifications-heading" eyebrow="Quality" title="Certifications" />
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certifications.map((certification, index) => (
            <li key={certification.id} {...revealProps(index)} className="rounded-lg border border-slate-200 border-l-4 border-l-orange bg-white p-5">
              <p className="font-semibold text-navy">{certification.name}</p>
              {certification.issuer ? <p className="mt-1 text-sm text-slate-600">{certification.issuer}</p> : null}
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <Link href="/certifications" className="font-semibold text-navy underline underline-offset-4">
            All certifications
          </Link>
        </p>
      </div>
    </section>
  );
}
