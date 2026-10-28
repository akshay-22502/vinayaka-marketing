import { SectionHeading } from "../SectionHeading";
import { revealProps } from "@/lib/reveal";

const REASONS = [
  {
    title: "Specifications up front",
    text: "Every product page lists properties, units and test methods in one table, so you can compare models without chasing datasheets.",
  },
  {
    title: "Help choosing the right product",
    text: "Send drawings, a bill of quantities or a short description of the project. We reply with product recommendations and a quotation.",
  },
  {
    title: "Four product families, one supplier",
    text: "Geogrids, geomembranes, geotextiles and geocells for roads, rail, landfills, ponds and slopes.",
  },
  {
    title: "India and the UAE",
    text: "Offices in both countries, so you can talk to someone in your own time zone.",
  },
];

/** Four short reasons to choose TerraTechBharat. */
export function WhyUs() {
  return (
    <section aria-labelledby="why-heading" className="container-page py-14 sm:py-20">
      <div {...revealProps()}>
        <SectionHeading id="why-heading" eyebrow="Why TerraTechBharat" title="Built for the people who specify and buy" />
      </div>
      <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map((reason, index) => (
          <li key={reason.title} {...revealProps(index)}>
            <span aria-hidden="true" className="reveal-bar block h-1 origin-left bg-orange" />
            <h3 className="mt-5 text-lg font-semibold text-navy">{reason.title}</h3>
            <p className="mt-2 text-slate-600">{reason.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
