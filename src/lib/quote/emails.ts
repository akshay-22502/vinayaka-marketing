import { countryName } from "@/lib/format";
import type { QuoteInput } from "./schema";

// The two emails a quote request sends. Everything the buyer typed is untrusted:
// in the HTML it goes through `escapeHtml`, and in a subject through `oneLine`.

export type RenderedEmail = { subject: string; html: string; text: string };

/** Escapes text for an HTML body or a quoted attribute. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line of plain text: line breaks and other control characters become spaces (no header injection). */
function oneLine(s: string): string {
  return s.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s{2,}/g, " ").trim();
}

const BLANK = "–";
const SUBJECT_NAME_MAX = 100;

const STYLE = {
  page: "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;",
  heading: "margin:0 0 16px;font-size:20px;color:#253F70;",
  table: "border-collapse:collapse;width:100%;max-width:640px;",
  label: "padding:6px 12px 6px 0;vertical-align:top;text-align:left;color:#475569;white-space:nowrap;",
  value: "padding:6px 0;vertical-align:top;",
  box: "margin:16px 0;padding:12px 16px;max-width:640px;background:#f1f5f9;border-left:4px solid #253F70;",
  note: "margin:16px 0 0;font-size:13px;color:#64748b;",
};

/** Text with line breaks kept, ready for an HTML body. */
function multiline(s: string): string {
  return escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");
}

function row(label: string, valueHtml: string): string {
  return `<tr><th style="${STYLE.label}">${escapeHtml(label)}</th><td style="${STYLE.value}">${valueHtml}</td></tr>`;
}

function productsHtml(names: string[]): string {
  return names.length > 0 ? names.map(escapeHtml).join("<br>") : BLANK;
}

export type TeamEmailOptions = {
  /** The buyer attached a file. It is not linked: admins download it from the admin panel. */
  hasAttachment?: boolean;
};

/** The notification for the country's sales team. */
export function renderTeamEmail(
  q: QuoteInput,
  productNames: string[],
  id: string,
  { hasAttachment = false }: TeamEmailOptions = {},
): RenderedEmail {
  const team = countryName(q.country);
  const subject = `New quote request (${team}): ${oneLine(q.name).slice(0, SUBJECT_NAME_MAX)}`;

  const attachmentNote =
    "The buyer attached a file. Open this request in the admin panel to download it.";

  const html = [
    `<div style="${STYLE.page}">`,
    `<h1 style="${STYLE.heading}">New quote request (${escapeHtml(team)})</h1>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="${STYLE.table}">`,
    row("Country", escapeHtml(team)),
    row("Name", escapeHtml(q.name)),
    row("Company", q.company ? escapeHtml(q.company) : BLANK),
    row("Email", `<a href="mailto:${escapeHtml(q.email)}">${escapeHtml(q.email)}</a>`),
    row("Phone", escapeHtml(q.phone)),
    row("Products", productsHtml(productNames)),
    row("Quantity", q.quantity ? escapeHtml(q.quantity) : BLANK),
    row("Project location", q.projectLocation ? escapeHtml(q.projectLocation) : BLANK),
    `</table>`,
    `<div style="${STYLE.box}"><strong>Message</strong><br>${multiline(q.message)}</div>`,
    hasAttachment ? `<p><strong>Attachment:</strong> ${escapeHtml(attachmentNote)}</p>` : "",
    `<p style="${STYLE.note}">Quote ID: ${escapeHtml(id)}<br>Reply to this email to answer the buyer directly.</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `New quote request (${team})`,
    "",
    `Country: ${team}`,
    `Name: ${q.name}`,
    `Company: ${q.company ?? BLANK}`,
    `Email: ${q.email}`,
    `Phone: ${q.phone}`,
    `Products: ${productNames.length > 0 ? productNames.join(", ") : BLANK}`,
    `Quantity: ${q.quantity ?? BLANK}`,
    `Project location: ${q.projectLocation ?? BLANK}`,
    "",
    "Message:",
    q.message,
    "",
    ...(hasAttachment ? [`Attachment: ${attachmentNote}`, ""] : []),
    `Quote ID: ${id}`,
    "Reply to this email to answer the buyer directly.",
  ].join("\n");

  return { subject, html, text };
}

/** The confirmation the buyer gets. */
export function renderBuyerEmail(q: QuoteInput, productNames: string[]): RenderedEmail {
  const team = countryName(q.country);
  const subject = "We received your quote request - TerraTechBharat";

  const detailRows = [
    ["Quantity", q.quantity],
    ["Project location", q.projectLocation],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const html = [
    `<div style="${STYLE.page}">`,
    `<h1 style="${STYLE.heading}">Thank you, ${escapeHtml(q.name)}</h1>`,
    `<p>We have received your quote request. Our ${escapeHtml(team)} team will review it and contact you using the details you gave us.</p>`,
    productNames.length > 0
      ? `<p><strong>Products</strong></p><ul>${productNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
      : "",
    detailRows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="${STYLE.table}">${detailRows
          .map(([label, value]) => row(label, escapeHtml(value)))
          .join("")}</table>`
      : "",
    `<div style="${STYLE.box}"><strong>Your message</strong><br>${multiline(q.message)}</div>`,
    `<p style="${STYLE.note}">TerraTechBharat, geosynthetics for India and the UAE.</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `Thank you, ${q.name}`,
    "",
    `We have received your quote request. Our ${team} team will review it and contact you using the details you gave us.`,
    "",
    ...(productNames.length > 0 ? ["Products:", ...productNames.map((name) => `- ${name}`), ""] : []),
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    ...(detailRows.length > 0 ? [""] : []),
    "Your message:",
    q.message,
    "",
    "TerraTechBharat, geosynthetics for India and the UAE.",
  ].join("\n");

  return { subject, html, text };
}
