const CHILE_TIMEZONE = "America/Santiago";

function partsForChile(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
}

function pickPart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getCurrentChileDateString() {
  const parts = partsForChile(new Date());
  return `${pickPart(parts, "year")}-${pickPart(parts, "month")}-${pickPart(parts, "day")}`;
}

export function getCurrentChileDateTimeLocal() {
  const parts = partsForChile(new Date());
  return `${pickPart(parts, "year")}-${pickPart(parts, "month")}-${pickPart(parts, "day")}T${pickPart(parts, "hour")}:${pickPart(parts, "minute")}`;
}

export function safeParseDateOnly(date: string, time = "00:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const safe = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
  return safe.toISOString();
}

export function diffDaysFromNow(dateTimeIso: string | null | undefined) {
  if (!dateTimeIso) return 0;
  const then = new Date(dateTimeIso);
  const now = new Date();
  return Math.max(0, Math.round((then.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}
