import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumb } from "@/components/site/Breadcrumb";
import { CoverImage } from "@/components/site/CoverImage";
import { Markdown } from "@/components/site/Markdown";
import { ProductCard } from "@/components/site/ProductCard";
import { QuoteCta } from "@/components/site/QuoteCta";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getProject, getProjects } from "@/lib/content/queries";
import { placeLabel } from "@/lib/format";
import { APPLICATION_PLACEHOLDER } from "@/lib/media";
import { metaDescription, pageMetadata } from "@/lib/seo";
import { publicMediaUrl } from "@/lib/storage";

export const revalidate = 3600;
// Projects published after the build are rendered on first visit, then cached.
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

// Called by both generateMetadata and the page; cache() makes it one query per request.
const loadProject = cache(getProject);

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) return {};
  return pageMetadata({
    title: project.title,
    description: metaDescription(project.summary),
    path: `/projects/${project.slug}`,
    image: publicMediaUrl(project.coverImage),
  });
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) notFound();

  const photos = project.images.flatMap((path) => publicMediaUrl(path) ?? []);
  const [mainPhoto, ...morePhotos] = photos;

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: project.title },
        ]}
      />
      <div className="mt-6">
        <SectionHeading
          level={1}
          eyebrow={placeLabel(project.location, project.country)}
          title={project.title}
          intro={project.summary || undefined}
        />
      </div>

      <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:aspect-[21/9]">
        <CoverImage
          src={mainPhoto ?? APPLICATION_PLACEHOLDER}
          alt={mainPhoto ? `${project.title}, photo 1 of ${photos.length}` : ""}
          sizes="(min-width: 1152px) 1088px, 100vw"
          priority
        />
      </div>
      {morePhotos.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          {morePhotos.map((src, index) => (
            <li key={`${index}-${src}`} className="min-w-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <CoverImage
                  src={src}
                  alt={`${project.title}, photo ${index + 2} of ${photos.length}`}
                  sizes="(min-width: 768px) 33vw, 50vw"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {project.body.trim() !== "" ? (
        <div className="mt-10 min-w-0 max-w-3xl">
          <Markdown topHeading={2}>{project.body}</Markdown>
        </div>
      ) : null}

      {project.products.length > 0 ? (
        <section aria-labelledby="products-used-heading" className="mt-14">
          <h2 id="products-used-heading" className="text-2xl font-bold tracking-tight text-navy">
            Products used
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {project.products.map((product) => (
              <li key={`${product.categorySlug}/${product.slug}`} className="min-w-0">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-16">
        <QuoteCta
          heading="Planning a similar project?"
          text="Tell us the location, quantities and ground conditions. We recommend the right products and send a quotation."
        />
      </div>
    </div>
  );
}
