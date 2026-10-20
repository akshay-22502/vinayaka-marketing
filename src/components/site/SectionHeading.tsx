type Props = {
  id?: string;
  title: string;
  intro?: string;
  /** Short label above the title. */
  eyebrow?: string;
  level?: 1 | 2;
};

/** Title block for a page section: optional eyebrow, a heading, and an intro line. */
export function SectionHeading({ id, title, intro, eyebrow, level = 2 }: Props) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="max-w-3xl">
      {eyebrow ? (
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-orange-dark">
          {eyebrow}
        </p>
      ) : null}
      <Heading
        id={id}
        className={`font-bold tracking-tight text-navy ${
          level === 1 ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {title}
      </Heading>
      {intro ? <p className="mt-3 text-lg leading-relaxed text-slate-600">{intro}</p> : null}
    </div>
  );
}
