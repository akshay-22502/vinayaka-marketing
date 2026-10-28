import Link from "next/link";
import type { Application } from "@/lib/content/types";
import { ApplicationCard } from "../ApplicationCard";
import { PinnedRail } from "./PinnedRail";
import { revealProps } from "@/lib/reveal";

/**
 * Applications in a sideways rail with a link to all of them. On large screens the section pins and
 * scrolling glides the cards past (PinnedRail); on phones the rail is swiped and snaps card by card.
 */
export function ApplicationsStrip({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;
  return (
    <section aria-labelledby="applications-heading" className="bg-white">
      <PinnedRail className="overflow-hidden py-20 sm:py-28 lg:py-0">
        <div className="container-page">
          <div {...revealProps()} className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-dark">Applications</p>
              <h2 id="applications-heading" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-navy sm:text-6xl">
                Where our products work.
              </h2>
            </div>
            <Link href="/applications" className="btn btn-secondary rounded-full px-6">
              All applications
            </Link>
          </div>
        </div>
        {/* The rail starts in line with the page content and runs to the right edge of the screen. */}
        <ul className="rail mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-6">
          {applications.map((application) => (
            // No scroll-in fade here: cards off to the side would wait for it while the rail slides.
            <li key={application.slug} className="w-[82vw] max-w-[26rem] shrink-0 snap-start sm:w-[24rem]">
              <ApplicationCard application={application} />
            </li>
          ))}
        </ul>
      </PinnedRail>
    </section>
  );
}
