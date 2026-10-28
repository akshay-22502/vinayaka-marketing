import { WordReveal } from "./WordReveal";

const STATEMENT =
  "We supply geogrids, geomembranes, geotextiles and geocells to contractors, traders and project owners across India and the UAE. Wholesale quantities, with the specifications up front.";

/** A one-paragraph statement of what the company does, lit up word by word on scroll. */
export function Statement() {
  return (
    <section aria-label="What we do" className="bg-white pt-24 sm:pt-36">
      <div className="container-page">
        <WordReveal
          text={STATEMENT}
          className="max-w-5xl text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-navy sm:text-5xl sm:leading-[1.1]"
        />
      </div>
    </section>
  );
}
