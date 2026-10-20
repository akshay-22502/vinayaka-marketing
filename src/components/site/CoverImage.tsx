import Image from "next/image";

type Props = {
  src: string;
  /** Empty for decorative images (placeholders, and pictures next to a text label). */
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/**
 * An image that fills its parent and crops to fit (object-fit: cover). The
 * parent must be `relative` and have a size, for example an aspect ratio.
 * SVG placeholders are served as they are; photos go through the optimizer.
 */
export function CoverImage({ src, alt, sizes, priority, className = "" }: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={src.endsWith(".svg")}
      className={`object-cover ${className}`}
    />
  );
}
