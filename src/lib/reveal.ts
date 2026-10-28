import type { CSSProperties } from "react";

/**
 * Props that make an element fade in as it scrolls into view (see ScrollReveal). `index`
 * staggers items of a list, capped so long lists do not lag.
 */
export function revealProps(index = 0) {
  return {
    "data-reveal": "",
    style: { "--reveal-delay": `${Math.min(index, 5) * 90}ms` } as CSSProperties,
  };
}
