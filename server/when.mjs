// Turns words like "Friday", "Nov 12" and "6pm" into real dates. Small models copy words well
// but get dates wrong, so the model only copies them and this does the working out.

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function startOfDay(now, ahead = 0) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ahead);
  return d;
}

// A date that has already gone this year means next year.
function nextDate(now, month, day) {
  const today = startOfDay(now);
  const date = new Date(today.getFullYear(), month, day);
  if (date < today) date.setFullYear(date.getFullYear() + 1);
  return date.getMonth() === month ? date : null;
}

// Returns midnight on that day, or null if the words don't name one.
export function readDay(words, now) {
  const text = String(words ?? "").toLowerCase().trim();
  if (!text) return null;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  if (/\b(today|tonight)\b/.test(text)) return startOfDay(now);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(text)) return startOfDay(now, 1);

  const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/)
    ?? text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (named) {
    const [a, b] = [named[1], named[2]];
    const month = MONTHS.indexOf(/\d/.test(a) ? b : a);
    return nextDate(now, month, Number(/\d/.test(a) ? a : b));
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) return nextDate(now, +slash[1] - 1, +slash[2]);

  const weekday = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (weekday) {
    const today = new Date(now).getDay();
    // The next one coming, so "Friday" said on a Friday means a week away.
    const ahead = (DAYS.indexOf(weekday[1]) - today + 7) % 7 || 7;
    return startOfDay(now, ahead);
  }
  return null;
}

// Every day named anywhere in a piece of text, as midnight timestamps.
const DAY_PHRASES = /\b(?:\d{4}-\d{2}-\d{2}|today|tonight|tomorrow|tmrw|tmr|\d{1,2}\/\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*)\b/gi;
export function daysIn(text, now) {
  return new Set((String(text).match(DAY_PHRASES) ?? [])
    .map((phrase) => readDay(phrase, now)?.getTime()).filter(Boolean));
}

// Returns [hours, minutes], or null if the words don't name a time.
export function readTime(words) {
  const text = String(words ?? "").toLowerCase().trim();
  if (/\bnoon\b/.test(text)) return [12, 0];
  if (/\bmidnight\b/.test(text)) return [23, 59];
  const found = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/);
  if (!found) return null;
  let hours = Number(found[1]);
  const minutes = Number(found[2] ?? 0);
  const half = found[3]?.[0];
  if (hours > 23 || minutes > 59) return null;
  if (half === "p" && hours < 12) hours += 12;
  if (half === "a" && hours === 12) hours = 0;
  // With no am or pm, a low number is an afternoon: nobody means 3 in the morning.
  if (!half && !found[2] && hours >= 1 && hours <= 7) hours += 12;
  if (!half && found[2] && hours >= 1 && hours <= 6) hours += 12;
  return [hours, minutes];
}

export function moment(dayWords, timeWords, now, fallback) {
  const day = dayWords instanceof Date ? new Date(dayWords) : readDay(dayWords, now);
  const time = readTime(timeWords) ?? fallback;
  if (!day || !time) return null;
  day.setHours(time[0], time[1], 0, 0);
  return day.getTime();
}
