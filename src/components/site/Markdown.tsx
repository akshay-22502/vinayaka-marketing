import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

type Props = {
  children: string;
  /**
   * Heading level that Markdown's top headings (`#`, `##`) become, so the page's
   * own heading order is kept. Deeper headings step down from there.
   */
  topHeading?: 2 | 3;
  className?: string;
};

function heading(level: number, className: string) {
  const Tag = `h${Math.min(level, 6)}` as "h2";
  return function MarkdownHeading({ children }: ComponentProps<"h2">) {
    return <Tag className={className}>{children}</Tag>;
  };
}

function componentsFor(top: number): Components {
  return {
    h1: heading(top, "mt-8 text-xl font-bold text-navy first:mt-0"),
    h2: heading(top, "mt-8 text-xl font-bold text-navy first:mt-0"),
    h3: heading(top + 1, "mt-6 text-lg font-semibold text-navy first:mt-0"),
    h4: heading(top + 2, "mt-5 text-base font-semibold text-navy first:mt-0"),
    h5: heading(top + 3, "mt-5 text-base font-semibold text-navy first:mt-0"),
    h6: heading(top + 4, "mt-5 text-base font-semibold text-navy first:mt-0"),
    p: ({ children }) => <p className="mt-4 first:mt-0">{children}</p>,
    ul: ({ children }) => <ul className="mt-4 list-disc space-y-1.5 pl-6 first:mt-0">{children}</ul>,
    ol: ({ children }) => (
      <ol className="mt-4 list-decimal space-y-1.5 pl-6 first:mt-0">{children}</ol>
    ),
    a: ({ href, children }) => {
      const external = !!href && /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          className="font-medium text-navy underline underline-offset-2 hover:text-slate-900"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-4 border-orange pl-4 text-slate-600">{children}</blockquote>
    ),
    hr: () => <hr className="my-8 border-slate-200" />,
    // Admin-written images and code blocks must never widen the page.
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element -- size unknown, any host
      <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="mt-4 h-auto max-w-full rounded-md" />
    ),
    pre: ({ children }) => (
      <pre className="mt-4 overflow-x-auto rounded-md bg-slate-100 p-4 text-sm">{children}</pre>
    ),
    code: ({ children }) => (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
  };
}

/**
 * Renders admin-written Markdown. Raw HTML in the text is not rendered (no
 * `rehype-raw`), and react-markdown drops unsafe link schemes such as `javascript:`.
 */
export function Markdown({ children, topHeading = 3, className = "" }: Props) {
  return (
    <div className={`break-words text-base leading-relaxed text-slate-700 ${className}`}>
      <ReactMarkdown components={componentsFor(topHeading)}>{children}</ReactMarkdown>
    </div>
  );
}
