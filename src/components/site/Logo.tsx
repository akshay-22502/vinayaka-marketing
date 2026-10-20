import Image from "next/image";
import Link from "next/link";

/**
 * The logo with the TerraTechBharat wordmark, linking home. For navy backgrounds:
 * the logo artwork sits on the same navy (#253f70), so it blends in. Served as
 * is (not re-encoded) so that match stays exact.
 */
export function Logo({ priority = false, large = false }: { priority?: boolean; large?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md sm:gap-3">
      <Image
        src="/brand/logo.png"
        alt=""
        width={382}
        height={314}
        priority={priority}
        unoptimized
        className={`h-14 w-auto shrink-0 ${large ? "lg:h-16" : ""}`}
      />
      <span className="truncate text-base font-bold tracking-tight text-white sm:text-xl">
        TerraTechBharat
      </span>
    </Link>
  );
}
