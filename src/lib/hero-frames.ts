// The home page's scroll sequence (components/site/home/ScrollHero.tsx): WebP frames rendered
// from a three.js scene, one set for landscape screens and one for portrait (phones).

export type HeroSet = "land" | "port";

export const HERO_FRAMES: Record<HeroSet, { count: number; width: number; height: number }> = {
  land: { count: 72, width: 1280, height: 720 },
  port: { count: 72, width: 720, height: 1280 },
};

/** URL of frame `index` (0-based) of a set. */
export function heroFrameUrl(set: HeroSet, index: number): string {
  return `/hero/${set}/${String(index).padStart(3, "0")}.webp`;
}
