import type { CSSProperties } from "react";
import Link from "next/link";
import { LayerStack } from "./LayerStack";

type Props = { tagline: string; title: string; text: string };

const riseDelay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

/** Opening banner: tagline, headline, pitch and the two main buttons, with the animated layer stack. */
export function Hero({ tagline, title, text }: Props) {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-navy text-white">
      {/* Decorative grid, a nod to geogrid; fades out towards the left. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-100 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_left,black,transparent_75%)]"
      />
      <div className="container-page relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:py-24 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div>
          {tagline ? (
            <p style={riseDelay(0)} className="rise-in flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-white/85">
              <span aria-hidden="true" className="h-1 w-10 bg-orange" />
              {tagline}
            </p>
          ) : null}
          <h1
            id="hero-heading"
            style={riseDelay(80)}
            className="rise-in mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
          >
            {title || "TerraTechBharat"}
          </h1>
          {text ? <p style={riseDelay(160)} className="rise-in mt-6 max-w-2xl text-lg leading-relaxed text-white/85">{text}</p> : null}
          <div style={riseDelay(240)} className="rise-in mt-9 flex flex-wrap gap-3">
            <Link href="/quote" className="btn btn-primary">
              Request a quote
            </Link>
            <Link href="/products" className="btn btn-light">
              Browse products
            </Link>
          </div>
        </div>
        <div className="lg:pl-4">
          <LayerStack />
        </div>
      </div>
    </section>
  );
}
