"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HERO_FRAMES, heroFrameUrl, type HeroSet } from "@/lib/hero-frames";

type Props = { tagline: string; title: string; text: string };

/**
 * The story told while the hero is pinned. `at` is the stretch of scroll progress (0..1) over
 * which a beat is on screen; it fades in and out at the ends.
 */
const BEATS = [
  {
    at: [0.17, 0.33],
    title: "Every junction, engineered.",
    text: "Stiff ribs meet at integral junctions, so the grid keeps its shape when the load arrives.",
  },
  {
    at: [0.43, 0.6],
    title: "Stone locks in.",
    text: "Aggregate settles into the apertures and interlocks with the ribs. The base layer spreads load instead of shifting.",
  },
  {
    at: [0.64, 0.82],
    title: "Built in layers.",
    text: "Subgrade, a geotextile separator, the geogrid-reinforced base, then the surface course.",
  },
] as const;

/** Opacity of a beat at progress p: fades over the first and last 18% of its stretch. */
function beatOpacity(p: number, [a, b]: readonly [number, number]) {
  const edge = (b - a) * 0.18;
  if (p <= a || p >= b) return 0;
  return Math.min(1, (p - a) / edge, (b - p) / edge);
}

// Frames load coarse to fine, so a fast scroller always has a nearby frame to show.
function loadOrder(count: number) {
  const order: number[] = [];
  const seen = new Set<number>();
  for (let step = 16; step >= 1; step /= 2)
    for (let i = 0; i < count; i += step)
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
  if (!seen.has(count - 1)) order.splice(1, 0, count - 1);
  return order;
}

/**
 * Opening banner. While it is pinned, scrolling plays a 3D sequence frame by frame on a canvas:
 * a geogrid unrolls, the camera dives to a junction, aggregate locks into the apertures, then a
 * road section builds up around it. Short lines of copy fade in over each stage.
 *
 * Without JavaScript, or for people who ask for reduced motion, it is a plain banner over the
 * first frame, and nothing is pinned.
 */
export function ScrollHero({ tagline, title, text }: Props) {
  const [mode, setMode] = useState<"static" | "scroll">("static");
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setMode("scroll");
  }, []);

  useEffect(() => {
    if (mode !== "scroll") return;
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!section || !canvas || !ctx) return;

    let set: HeroSet = window.innerHeight > window.innerWidth ? "port" : "land";
    let images: (HTMLImageElement | null)[] = [];
    let cancelled = false;
    let shown = -1;
    let raf = 0;

    // Slow or data-saving connections get every fourth frame only.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const light = Boolean(connection?.saveData || /(^|-)2g|3g/.test(connection?.effectiveType ?? ""));

    function load() {
      const { count } = HERO_FRAMES[set];
      images = new Array(count).fill(null);
      const order = loadOrder(count).filter((i) => !light || i % 4 === 0 || i === count - 1);
      const forSet = set;
      let next = 0;
      // A few requests at a time, in order, so the coarse pass finishes first.
      const pump = () => {
        if (cancelled || forSet !== set || next >= order.length) return;
        const index = order[next++];
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (forSet !== set) return;
          images[index] = img;
          shown = -1;
          schedule();
          pump();
        };
        img.onerror = pump;
        img.src = heroFrameUrl(forSet, index);
      };
      for (let k = 0; k < 4; k++) pump();
    }

    function nearestLoaded(i: number) {
      for (let d = 0; d < images.length; d++) {
        if (images[i - d]) return i - d;
        if (images[i + d]) return i + d;
      }
      return -1;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(canvas!.clientWidth * dpr);
      canvas!.height = Math.round(canvas!.clientHeight * dpr);
      shown = -1;
    }

    function progress() {
      const rect = section!.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      return total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
    }

    function paint(img: HTMLImageElement, alpha: number) {
      // Cover the canvas, like object-fit: cover.
      const scale = Math.max(canvas!.width / img.naturalWidth, canvas!.height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx!.globalAlpha = alpha;
      ctx!.drawImage(img, (canvas!.width - w) / 2, (canvas!.height - h) / 2, w, h);
      ctx!.globalAlpha = 1;
    }

    function draw() {
      raf = 0;
      const p = progress();
      const { count } = HERO_FRAMES[set];
      // Between two frames, the next one is blended over the last at partial opacity, so the
      // sequence scrubs smoothly with a modest number of frames.
      const exact = p * (count - 1);
      const base = Math.floor(exact);
      const a = nearestLoaded(base);
      const b = images[base + 1] ? base + 1 : -1;
      const mix = b >= 0 && a === base ? Math.round((exact - base) * 12) / 12 : 0;
      const key = a + mix / 100;
      if (a >= 0 && key !== shown) {
        paint(images[a]!, 1);
        if (mix > 0) paint(images[b]!, mix);
        shown = key;
      }
      const intro = Math.max(0, 1 - p / 0.1);
      if (introRef.current) {
        introRef.current.style.opacity = String(intro);
        introRef.current.style.transform = `translateY(${(1 - intro) * -40}px)`;
        introRef.current.style.visibility = intro > 0 ? "visible" : "hidden";
      }
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - p / 0.03));
      BEATS.forEach((beat, i) => {
        const el = beatRefs.current[i];
        if (!el) return;
        const o = beatOpacity(p, beat.at);
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 24}px)`;
        el.style.visibility = o > 0 ? "visible" : "hidden";
      });
      const end = Math.min(1, Math.max(0, (p - 0.88) / 0.08));
      if (endRef.current) {
        endRef.current.style.opacity = String(end);
        endRef.current.style.transform = `translateY(${(1 - end) * 24}px)`;
        endRef.current.style.visibility = end > 0 ? "visible" : "hidden";
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    function onResize() {
      const nextSet: HeroSet = window.innerHeight > window.innerWidth ? "port" : "land";
      resize();
      if (nextSet !== set) {
        set = nextSet;
        load();
      }
      schedule();
    }

    resize();
    load();
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
    };
  }, [mode]);

  const scroll = mode === "scroll";

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-heading"
      data-hero-mode={mode}
      className={`relative bg-[#060c1a] text-white ${scroll ? "h-[520svh]" : ""}`}
    >
      <div className={`${scroll ? "sticky top-0" : "relative"} h-svh min-h-[36rem] overflow-hidden`}>
        {/* The first frame as a plain picture, so the banner looks the same before and after the
            script starts. The canvas paints over it. */}
        <picture>
          <source media="(orientation: portrait)" srcSet={heroFrameUrl("port", 0)} />
          <img src={heroFrameUrl("land", 0)} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" />
        </picture>
        {scroll ? <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" /> : null}
        {/* Darkens the side the copy sits on so it reads over the render. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,12,26,0.9)_0%,rgba(6,12,26,0.55)_45%,rgba(6,12,26,0)_75%)] lg:bg-[linear-gradient(90deg,rgba(6,12,26,0.8)_0%,rgba(6,12,26,0.35)_40%,rgba(6,12,26,0)_65%)]"
        />

        <div ref={introRef} className="container-page relative flex h-full flex-col justify-start pt-24 sm:pt-28 lg:justify-center lg:pt-0">
          <div className="max-w-2xl pb-16">
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
          </div>
        </div>

        {scroll ? (
          <>
            {BEATS.map((beat, i) => (
              <div
                key={beat.title}
                ref={(el) => {
                  beatRefs.current[i] = el;
                }}
                style={{ opacity: 0, visibility: "hidden" }}
                className="pointer-events-none absolute inset-x-0 top-0 pt-24 sm:pt-28 lg:inset-y-0 lg:flex lg:items-center lg:pt-0"
              >
                <div className="container-page">
                  <div className="max-w-md">
                    <p className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">{beat.title}</p>
                    <p className="mt-4 text-lg leading-relaxed text-white/80 sm:text-xl">{beat.text}</p>
                  </div>
                </div>
              </div>
            ))}
            <div
              ref={endRef}
              style={{ opacity: 0, visibility: "hidden" }}
              className="absolute inset-x-0 top-0 pt-24 sm:pt-28 lg:inset-y-0 lg:flex lg:items-center lg:pt-0"
            >
              <div className="container-page">
                <div className="max-w-md">
                  <p className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
                    Reinforce the base. <span className="text-orange">Build to last.</span>
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link href="/products/geogrid" className="btn btn-primary rounded-full px-6">
                      Explore geogrids
                    </Link>
                    <Link href="/applications" className="btn btn-light rounded-full px-6">
                      See applications
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div ref={hintRef} aria-hidden="true" className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-white/60">
              Scroll
              <span className="block h-8 w-px animate-pulse bg-white/50" />
            </div>
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div ref={barRef} className="h-full origin-left scale-x-0 bg-orange" />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
