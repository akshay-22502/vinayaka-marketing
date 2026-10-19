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

/**
 * A stored timestamp written out as "19 October 2026, 14:05 UTC". Always in UTC and done by hand, so
 * the text does not depend on the server's time zone. Text that is not a timestamp comes back unchanged.
 */
export function formatDateTimeUtc(timestamp: string): string {
  const time = new Date(timestamp);
  if (!/^\d{4}-\d{2}-\d{2}/.test(timestamp) || Number.isNaN(time.getTime())) return timestamp;
  const hours = String(time.getUTCHours()).padStart(2, "0");
  const minutes = String(time.getUTCMinutes()).padStart(2, "0");
  return `${time.getUTCDate()} ${MONTHS[time.getUTCMonth()]} ${time.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

/** How a country code is written on the site. */
export function countryName(country: Country): string {
  return country === "IN" ? "India" : "UAE";
}

/** "Pune, India": a project's location and country. A blank location leaves just the country. */
export function placeLabel(location: string, country: Country): string {
  return [location.trim(), countryName(country)].filter(Boolean).join(", ");
}
