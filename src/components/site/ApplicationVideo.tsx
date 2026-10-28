type Props = { src: string; poster: string };

/**
 * A short, silent 3D clip of an application being built, filling its parent. It shows its poster
 * (the finished build) until ScrollReveal plays it once half of it is on screen; it then stops on
 * its last frame. Nothing is downloaded before that, and it never plays for reduced motion.
 */
export function ApplicationVideo({ src, poster }: Props) {
  return (
    <video
      data-play-in-view=""
      className="absolute inset-0 h-full w-full object-cover"
      poster={poster}
      muted
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
