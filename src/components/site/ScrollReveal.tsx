"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Plays the scroll animations (styles in globals.css):
 * - `[data-reveal]` elements fade and lift into place as they scroll into view. Only elements that
 *   start below the fold are hidden, so nothing visible on load blinks.
 * - `[data-scene]` drawings are held on their first frame, then play once half of one is in view.
 * Nothing is hidden or held until this has run, so the page reads fine without JavaScript, and
 * nothing moves for people who ask for reduced motion. Runs again after each client navigation.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target;
          if (element.hasAttribute("data-scene")) {
            // Wait until half the drawing is on screen, so it is not over before anyone sees it.
            if (entry.intersectionRatio < 0.5) continue;
            element.setAttribute("data-scene-state", "play");
          } else {
            element.setAttribute("data-reveal", "shown");
          }
          observer.unobserve(element);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: [0, 0.5] },
    );

    for (const element of document.querySelectorAll<HTMLElement>("[data-reveal='']")) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute("data-reveal", "hidden");
      observer.observe(element);
    }
    for (const element of document.querySelectorAll<HTMLElement>("[data-scene]:not([data-scene-state])")) {
      element.setAttribute("data-scene-state", "ready");
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
