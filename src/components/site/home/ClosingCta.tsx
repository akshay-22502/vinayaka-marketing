import Link from "next/link";

/** Full-width closing call to action on the home page. */
export function ClosingCta() {
  return (
    <section
      aria-labelledby="quote-cta-heading"
      className="relative overflow-hidden bg-[#060c1a] py-24 text-center text-white sm:py-36"
    >
      {/* Faint grid, a nod to geogrid, glowing from the centre. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
      <div data-reveal="" className="container-page relative">
        <h2 id="quote-cta-heading" className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Tell us about your project.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
          Send your product needs, quantities and delivery location. We reply with recommendations and a quotation.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/quote" className="btn btn-primary rounded-full px-7">
            Request a quote
          </Link>
          <Link href="/contact" className="btn btn-light rounded-full px-7">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
