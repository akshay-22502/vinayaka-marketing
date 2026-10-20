import Link from "next/link";

type Props = {
  heading: string;
  text: string;
  /** Where the button goes; a product page passes `/quote?product=<slug>`. */
  href?: string;
};

/** Closing call to action: a navy card with a Request a quote button. */
export function QuoteCta({ heading, text, href = "/quote" }: Props) {
  return (
    <section
      aria-labelledby="quote-cta-heading"
      className="flex flex-col gap-6 rounded-xl bg-navy p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"
    >
      <div className="max-w-2xl">
        <h2 id="quote-cta-heading" className="text-2xl font-bold tracking-tight">
          {heading}
        </h2>
        <p className="mt-2 text-white/85">{text}</p>
      </div>
      <Link href={href} className="btn btn-primary shrink-0">
        Request a quote
      </Link>
    </section>
  );
}
