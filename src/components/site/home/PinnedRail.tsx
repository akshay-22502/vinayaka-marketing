"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * On large screens, pins its content while vertical scrolling slides the `.rail` inside it
 * sideways, so the cards glide past. On phones, or for people who ask for reduced motion, the
 * rail stays a normal swipeable row.
 */
export function PinnedRail({ children, className = "" }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPinned(wide.matches && !still.matches);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const box = outer.current;
    const rail = inner.current?.querySelector<HTMLElement>(".rail");
    if (!pinned || !box || !rail) return;
    let raf = 0;
    let travel = 0;
    const measure = () => {
      travel = Math.max(0, rail.scrollWidth - rail.clientWidth);
      box.style.height = `${window.innerHeight + travel}px`;
    };
    const draw = () => {
      raf = 0;
      const rect = box.getBoundingClientRect();
      const p = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      rail.style.transform = `translateX(${-p * travel}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onResize = () => {
      measure();
      schedule();
    };
    measure();
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      box.style.height = "";
      rail.style.transform = "";
    };
  }, [pinned]);

  return (
    <div ref={outer} data-rail-pinned={pinned ? "" : undefined} className="relative">
      <div ref={inner} className={pinned ? `sticky top-0 flex h-svh flex-col justify-center overflow-hidden ${className}` : className}>
        {children}
      </div>
    </div>
  );
}
