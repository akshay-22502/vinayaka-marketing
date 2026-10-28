"use client";

import { useEffect, useRef } from "react";

type Props = { text: string; className?: string };

/**
 * A large statement whose words light up one after another as it scrolls through the screen.
 * Words start dim only once this has run and motion is allowed, so the text always reads.
 */
export function WordReveal({ text, className = "" }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-word]"));
    let raf = 0;
    const draw = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the top reaches 85% down the screen, 1 when the bottom reaches 45%.
      const p = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (rect.height + vh * 0.4)));
      const lit = p * spans.length;
      spans.forEach((span, i) => {
        span.style.opacity = String(0.18 + 0.82 * Math.min(1, Math.max(0, lit - i)));
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
  }, [text]);

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={i} data-word="" className="transition-opacity duration-150">
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
