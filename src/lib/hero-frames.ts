// Frames of the scroll stories (components/site/ScrollStory.tsx): WebP stills rendered from a
// three.js scene, one set for landscape screens and one for portrait (phones), per scene.

import type { StoryScene } from "./scroll-stories";

export type HeroSet = "land" | "port";

export const HERO_FRAMES: Record<HeroSet, { count: number; width: number; height: number }> = {
  land: { count: 72, width: 1280, height: 720 },
  port: { count: 72, width: 720, height: 1280 },
};

/** URL of frame `index` (0-based) of a scene's set. */
export function heroFrameUrl(scene: StoryScene, set: HeroSet, index: number): string {
  return `/hero/${scene}/${set}/${String(index).padStart(3, "0")}.webp`;
}
