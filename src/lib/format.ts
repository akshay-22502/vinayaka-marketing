import type { Country } from "@/lib/content/types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A stored date (`YYYY-MM-DD`) written out as "31 December 2027". Done by hand
 * rather than with `Intl`, so the day never shifts with the server's time zone
 * and the text is the same on the server and in the browser. Text that is not
 * a date comes back unchanged.
 */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return isoDate;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

// India Standard Time is UTC+5:30 all year (no daylight saving), so a fixed offset is exact.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * A stored timestamp moved onto India time and read with the UTC getters, so the result does
 * not depend on the server's time zone. Undefined when the text is not a timestamp.
 */
function inIst(timestamp: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(timestamp)) return undefined;
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return undefined;
  return new Date(time.getTime() + IST_OFFSET_MS);
}

function dayAndMonth(ist: Date): string {
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/**
 * A stored timestamp written out in India time as "19 October 2026, 19:35 IST" (Ruling R19: the
 * admin shows IST, whatever the server's or the browser's zone). Done by hand, so the text is the
 * same everywhere. Text that is not a timestamp comes back unchanged.
 */
export function formatDateTimeIst(timestamp: string): string {
  const ist = inIst(timestamp);
  if (!ist) return timestamp;
  const hours = String(ist.getUTCHours()).padStart(2, "0");
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${dayAndMonth(ist)}, ${hours}:${minutes} IST`;
}

/**
 * The day a stored timestamp falls on in India, as "20 October 2026": a request that arrives at
 * 22:30 UTC is already on the next day there. Text that is not a timestamp comes back unchanged.
 */
export function formatDateIst(timestamp: string): string {
  const ist = inIst(timestamp);
  return ist ? dayAndMonth(ist) : timestamp;
}

/** How a country code is written on the site. */
export function countryName(country: Country): string {
  return country === "IN" ? "India" : "UAE";
}

/** "Pune, India": a project's location and country. A blank location leaves just the country. */
export function placeLabel(location: string, country: Country): string {
  return [location.trim(), countryName(country)].filter(Boolean).join(", ");
}
