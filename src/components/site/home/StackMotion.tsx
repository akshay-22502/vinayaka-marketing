"use client";

import { useEffect } from "react";

/**
 * Scroll motion for the stacking product cards (ProductLines): as the next card slides over one,
 * it shrinks back and darkens, and each card's picture settles from a slight zoom as it arrives.
 * Sets `--cover` (0..1) and `--enter` (0..1) on each `[data-stack-card]`; the styles are in
 * globals.css. Nothing moves for people who ask for reduced motion.
 */
export function StackMotion({ selector }: { selector: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(`${selector} [data-stack-card]`));
    if (cards.length === 0) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const vh = window.innerHeight;
      cards.forEach((card, i) => {
        const rect = card.getBoundingClientRect();
        const next = cards[i + 1]?.getBoundingClientRect();
        // How far the next card has slid up over this one.
        const cover = next ? Math.min(1, Math.max(0, (rect.bottom - next.top) / rect.height)) : 0;
        const enter = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.8)));
        card.style.setProperty("--cover", cover.toFixed(3));
        card.style.setProperty("--enter", enter.toFixed(3));
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [selector]);
  return null;
}
