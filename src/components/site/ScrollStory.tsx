"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { HERO_FRAMES, heroFrameUrl, type HeroSet } from "@/lib/hero-frames";
import { STORIES, type StoryScene } from "@/lib/scroll-stories";

type Props = {
  scene: StoryScene;
  /** Id of the heading inside `intro` that names the section. */
  labelledBy: string;
  /** What shows first: heading, text and buttons. It fades out as the story starts. */
  intro: ReactNode;
  /** Buttons under the closing line, in place of the story's own. */
  endLinks?: readonly { href: string; label: string }[];
};

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

/** Frames fetched from the HTML itself, before the script runs: the first, coarse pass. */
const PRELOAD_COUNT = 6;

/** Requests in flight at once. HTTP/2 serves them over one connection. */
const PARALLEL = 8;

/**
 * Opening banner that tells a product's story. While it is pinned, scrolling plays a rendered 3D
 * sequence frame by frame on a canvas (see lib/scroll-stories.ts for what each one shows), and
 * short lines of copy fade in over each stage, ending on a call to action.
 *
 * Without JavaScript, or for people who ask for reduced motion, it is a plain banner over the
 * first frame, and nothing is pinned.
 */
export function ScrollStory({ scene, labelledBy, intro, endLinks }: Props) {
  const { beats, end } = STORIES[scene];
  const links = endLinks ?? end.links;
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
        img.src = heroFrameUrl(scene, forSet, index);
        // Decoded before it is used, so drawing it while scrolling never waits on decoding.
        img
          .decode()
          .then(() => {
            if (forSet !== set) return;
            images[index] = img;
            shown = -1;
            schedule();
          })
          .catch(() => {})
          .finally(pump);
      };
      for (let k = 0; k < PARALLEL; k++) pump();
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
      beats.forEach((beat, i) => {
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
  }, [mode, scene, beats]);

  const scroll = mode === "scroll";

  // Start fetching the coarse frames with the page, so they are cached when the script asks.
  for (const set of ["port", "land"] as const) {
    const { count } = HERO_FRAMES[set];
    for (const index of loadOrder(count).slice(1, PRELOAD_COUNT))
      preload(heroFrameUrl(scene, set, index), {
        as: "image",
        fetchPriority: "low",
        media: set === "port" ? "(orientation: portrait)" : "(orientation: landscape)",
      });
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby={labelledBy}
      data-story-mode={mode}
      className={`relative bg-[#060c1a] text-white ${scroll ? "h-[520svh]" : ""}`}
    >
      <div className={`${scroll ? "sticky top-0" : "relative"} h-svh min-h-[36rem] overflow-hidden`}>
        {/* The first frame as a plain picture, so the banner looks the same before and after the
            script starts. The canvas paints over it. */}
        <picture>
          <source media="(orientation: portrait)" srcSet={heroFrameUrl(scene, "port", 0)} />
          <img src={heroFrameUrl(scene, "land", 0)} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" />
        </picture>
        {scroll ? <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" /> : null}
        {/* Darkens the side the copy sits on so it reads over the render. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,12,26,0.9)_0%,rgba(6,12,26,0.55)_45%,rgba(6,12,26,0)_75%)] lg:bg-[linear-gradient(90deg,rgba(6,12,26,0.8)_0%,rgba(6,12,26,0.35)_40%,rgba(6,12,26,0)_65%)]"
        />

        <div ref={introRef} className="container-page relative flex h-full flex-col justify-start pt-24 sm:pt-28 lg:justify-center lg:pt-0">
          <div className="max-w-2xl pb-16">{intro}</div>
        </div>

        {scroll ? (
          <>
            {beats.map((beat, i) => (
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
                    {end.title} <span className="text-orange">{end.accent}</span>
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    {links.map((link, i) => (
                      <Link key={link.href} href={link.href} className={`btn ${i === 0 ? "btn-primary" : "btn-light"} rounded-full px-6`}>
                        {link.label}
                      </Link>
                    ))}
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
