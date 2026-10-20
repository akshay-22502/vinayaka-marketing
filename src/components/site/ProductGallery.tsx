"use client";

import { useState } from "react";
import { CoverImage } from "./CoverImage";

type Props = {
  productName: string;
  /** Photo URLs. May be empty. */
  images: string[];
  /** Shown when there are no photos. */
  placeholder: string;
};

/**
 * Product photos: one large image and, when there are several, a row of
 * thumbnail buttons to switch between them. With no photos it shows the
 * category placeholder.
 */
export function ProductGallery({ productName, images, placeholder }: Props) {
  const [selected, setSelected] = useState(0);
  const sizes = "(min-width: 1024px) 560px, 100vw";

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <CoverImage src={placeholder} alt="" sizes={sizes} priority />
      </div>
    );
  }

  const current = Math.min(selected, images.length - 1);
  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <CoverImage
          key={images[current]}
          src={images[current]}
          alt={`${productName}, photo ${current + 1} of ${images.length}`}
          sizes={sizes}
          priority
        />
      </div>
      {images.length > 1 ? (
        <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5" aria-label={`${productName} photos`}>
          {images.map((src, index) => (
            <li key={`${index}-${src}`}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === current}
                className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 bg-slate-100 ${
                  index === current ? "border-navy" : "border-transparent hover:border-slate-300"
                }`}
              >
                <CoverImage src={src} alt="" sizes="120px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
