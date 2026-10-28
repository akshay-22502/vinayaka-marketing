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

/** Four short reasons to choose TerraTechBharat, as tiles. */
export function WhyUs() {
  return (
    <section aria-labelledby="why-heading" className="bg-[#f5f5f7] py-20 sm:py-28">
      <div className="container-page">
        <div {...revealProps()} className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-dark">Why TerraTechBharat</p>
          <h2 id="why-heading" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-navy sm:text-6xl">
            Built for the people who specify and buy.
          </h2>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {REASONS.map((reason, index) => (
            <li key={reason.title} {...revealProps(index)} className="rounded-[2rem] bg-white p-8 sm:p-10">
              <span aria-hidden="true" className="reveal-bar block h-1 w-12 origin-left rounded-full bg-orange" />
              <h3 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-navy">{reason.title}</h3>
              <p className="mt-3 text-lg leading-relaxed text-slate-600">{reason.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
