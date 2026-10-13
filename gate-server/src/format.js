import { config } from "./config.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function zonedParts(date, timeZone = config.timeZone) {
  const parts = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .forEach((p) => (parts[p.type] = Number(p.value)));
  return parts;
}

// Wall-clock time in the display time zone → Date
function fromZoned(y, mo, d, h, mi, s) {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const p = zonedParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return new Date(guess - offset);
}

const hour24 = (h, ampm) => {
  if (!ampm) return h;
  const pm = ampm.toUpperCase() === "PM";
  return (h % 12) + (pm ? 12 : 0);
};

// Pass validity is stored as text (VARCHAR). Accepts the common forms:
//   2026-08-20 15:49[:00]   2026-08-20T10:19:00Z   20-AUG-2026 15:49
//   20-08-2026 15:49        20/08/2026 3:49 PM     (date only works too)
// Times without a zone are in the display time zone. With endOfDay, a
// date-only value means the end of that day (for "valid till").
export function parseDbDateTime(value, { endOfDay = false } = {}) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const time = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?)?`;
  const build = (y, mo, d, h, mi, sec, ampm) => {
    if (h === undefined) return endOfDay ? fromZoned(y, mo, d, 23, 59, 59) : fromZoned(y, mo, d, 0, 0, 0);
    return fromZoned(y, mo, d, hour24(Number(h), ampm), Number(mi), Number(sec ?? 0));
  };

  let m = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${time}$`, "i").exec(s);
  if (m) return build(+m[1], +m[2] - 1, +m[3], m[4], m[5], m[6], m[7]);

  m = new RegExp(String.raw`^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})${time}$`, "i").exec(s);
  if (m && MONTHS.includes(m[2].toUpperCase())) {
    return build(+m[3], MONTHS.indexOf(m[2].toUpperCase()), +m[1], m[4], m[5], m[6], m[7]);
  }

  // Day first (Indian convention): 20-08-2026, 20/08/2026, 20.08.2026
  m = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})${time}$`, "i").exec(s);
  if (m) return build(+m[3], +m[2] - 1, +m[1], m[4], m[5], m[6], m[7]);

  return null;
}

const pad = (n) => String(n).padStart(2, "0");

// Date → "20-AUG-2026 15:49" in the display time zone
export function formatDateTime(date) {
  const p = zonedParts(date instanceof Date ? date : new Date(date));
  return `${pad(p.day)}-${MONTHS[p.month - 1]}-${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

// A stored date/time for display: formatted if it can be read, else as stored
export function displayDateTime(value) {
  if (value == null || value === "") return null;
  const d = parseDbDateTime(value);
  return d ? formatDateTime(d) : String(value);
}

// Today's date ("YYYY-MM-DD") in the display time zone
export function localDate(date = new Date()) {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
