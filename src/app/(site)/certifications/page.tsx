import Image from "next/image";
import { notFound } from "next/navigation";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getCertifications } from "@/lib/content/queries";
import type { Certification } from "@/lib/content/types";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Certifications",
  description:
    "Quality certifications and test approvals held by TerraTechBharat and its products.",
  path: "/certifications",
});

function CertificationCard({ certification }: { certification: Certification }) {
  const image = publicMediaUrl(certification.imagePath);
  const file = publicMediaUrl(certification.filePath);

  return (
    <article className="flex h-full gap-4 rounded-xl border border-slate-200 border-l-4 border-l-orange bg-white p-5">
      {image ? (
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
          <Image
            src={image}
            alt=""
            fill
            sizes="80px"
            unoptimized={image.endsWith(".svg")}
            className="object-contain p-1"
          />
        </div>
      ) : null}
      <div className="min-w-0">
        <h2 className="break-words text-lg font-semibold text-navy">{certification.name}</h2>
        {certification.issuer ? (
          <p className="mt-1 break-words text-slate-600">{certification.issuer}</p>
        ) : null}
        {certification.validUntil ? (
          <p className="mt-1 text-sm text-slate-600">
            Valid until <time dateTime={certification.validUntil}>{formatDate(certification.validUntil)}</time>
          </p>
        ) : null}
        {file ? (
          <p className="mt-3">
            <a
              href={file}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-navy underline underline-offset-4"
            >
              View certificate<span className="sr-only">: {certification.name}</span>
            </a>
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default async function CertificationsPage() {
  const certifications = await getCertifications();
  // Hidden until there is something to show; the header and footer links are hidden too.
  if (certifications.length === 0) notFound();

  return (
    <div className="container-page py-12 sm:py-16">
      <SectionHeading
        level={1}
        title="Certifications"
        intro="Quality management and product approvals behind the materials we supply."
      />
      <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {certifications.map((certification) => (
          <li key={certification.id} className="min-w-0">
            <CertificationCard certification={certification} />
          </li>
        ))}
      </ul>
      <div className="mt-16">
        <QuoteCta
          heading="Need certificates for your tender?"
          text="Ask for the documents your project requires when you request a quote."
        />
      </div>
    </div>
  );
}
