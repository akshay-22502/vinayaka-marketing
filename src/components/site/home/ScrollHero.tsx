import Link from "next/link";
import { ScrollStory } from "../ScrollStory";

type Props = { tagline: string; title: string; text: string };

/** Home page banner: the admin tagline, headline and pitch over the geogrid scroll story. */
export function ScrollHero({ tagline, title, text }: Props) {
  return (
    <ScrollStory
      scene="geogrid"
      labelledBy="hero-heading"
      intro={
        <>
          {tagline ? (
            <p className="rise-in flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
              <span aria-hidden="true" className="h-0.5 w-10 bg-orange" />
              {tagline}
            </p>
          ) : null}
          <h1
            id="hero-heading"
            className="rise-in mt-5 text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.03em] [--rise-delay:80ms] sm:text-6xl lg:text-7xl"
          >
            {title || "TerraTechBharat"}
          </h1>
          {text ? (
            <p className="rise-in mt-6 max-w-xl text-lg leading-relaxed text-white/80 [--rise-delay:160ms] sm:text-xl">{text}</p>
          ) : null}
          <div className="rise-in mt-9 flex flex-wrap gap-3 [--rise-delay:240ms]">
            <Link href="/quote" className="btn btn-primary rounded-full px-6">
              Request a quote
            </Link>
            <Link href="/products" className="btn btn-light rounded-full px-6">
              Browse products
            </Link>
          </div>
        </>
      }
    />
  );
}
