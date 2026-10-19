// Office contact details come from site settings, where the owner types them
// in. Until then the seed leaves "[bracketed]" placeholders. Those, and empty
// values, must show as plain text and never become tel:, mailto: or wa.me links.

/** True when the value is real contact info: not blank and not a "[bracketed]" placeholder. */
export function isFilledIn(value: string): boolean {
  const text = value.trim();
  return text !== "" && !text.startsWith("[");
}

/** `tel:` link for a phone number, or null when there is no usable number. */
export function telHref(phone: string): string | null {
  if (!isFilledIn(phone)) return null;
  const text = phone.trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return `tel:${text.startsWith("+") ? "+" : ""}${digits}`;
}

/** `mailto:` link for an email address, or null when it is not a plain address. */
export function mailtoHref(email: string): string | null {
  if (!isFilledIn(email)) return null;
  const text = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? `mailto:${text}` : null;
}

/** `wa.me` link for a WhatsApp number (country code included), or null. */
export function whatsappHref(number: string): string | null {
  if (!isFilledIn(number)) return null;
  const digits = number.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}
