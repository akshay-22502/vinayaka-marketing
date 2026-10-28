"use client";

import { useEffect } from "react";

/**
 * Fades and lifts `[data-reveal]` elements into place as they scroll into view (styles in
 * globals.css). Only elements that start below the fold are hidden, and only once this has run,
 * so the page reads fine without JavaScript, and nothing moves for people who ask for reduced motion.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", "shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    for (const element of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute("data-reveal", "hidden");
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
