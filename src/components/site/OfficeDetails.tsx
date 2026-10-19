import { mailtoHref, telHref, whatsappHref } from "@/lib/contact";

type Props = {
  /** Heading, e.g. "India office". */
  title: string;
  headingLevel?: 2 | 3;
  /** Id for the heading, so a surrounding `<section aria-labelledby>` can name itself after it. */
  headingId?: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** "dark" for navy backgrounds, "light" for white or slate ones. */
  tone?: "dark" | "light";
};

function Row({
  label,
  value,
  href,
  linkClass,
}: {
  label: string;
  value: string;
  href: string | null;
  linkClass: string;
}) {
  if (value.trim() === "") return null;
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 opacity-80">{label}</dt>
      <dd className="min-w-0 break-words">
        {href ? (
          <a href={href} className={linkClass}>
            {value}
          </a>
        ) : (
          // Empty or [bracketed] placeholder values stay plain text (never a tel:/mailto:/wa.me link).
          value
        )}
      </dd>
    </div>
  );
}

/** One office: address, phone, WhatsApp and email. Only real values become links. */
export function OfficeDetails({
  title,
  headingLevel = 3,
  headingId,
  address,
  phone,
  whatsapp,
  email,
  tone = "light",
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const dark = tone === "dark";
  const linkClass = dark
    ? "underline underline-offset-2 hover:text-white"
    : "font-medium text-navy underline underline-offset-2 hover:text-slate-900";

  return (
    <div className={dark ? "text-white/80" : "text-slate-700"}>
      <Heading id={headingId} className={`text-lg font-semibold ${dark ? "text-white" : "text-navy"}`}>
        {title}
      </Heading>
      {address.trim() !== "" ? <p className="mt-2 whitespace-pre-line break-words">{address}</p> : null}
      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Phone" value={phone} href={telHref(phone)} linkClass={linkClass} />
        <Row label="WhatsApp" value={whatsapp} href={whatsappHref(whatsapp)} linkClass={linkClass} />
        <Row label="Email" value={email} href={mailtoHref(email)} linkClass={linkClass} />
      </dl>
    </div>
  );
}
