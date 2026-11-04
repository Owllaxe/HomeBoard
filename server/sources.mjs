// Keeps the calendar and assignments up to date from their private links.
import { readCalendar } from "./calendar.mjs";

const REFRESH = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export const WEEKS_AHEAD = 5;
const MOST_BYTES = 20 * 1024 * 1024;
// Brightspace also lists when an assignment opens and closes. Only the due date is a task.
const NOT_A_DEADLINE = /\b(availab\w*|opens?|starts?)\b/i;
const DUE_WORDING = /\s*[-–:]\s*(due|due date)\s*$/i;

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

async function download(link) {
  const response = await fetch(link.replace(/^webcal:/i, "https:"), {
    signal: AbortSignal.timeout(20000),
    headers: { accept: "text/calendar" },
  });
  if (!response.ok) throw new Error(`The link answered with error ${response.status}`);
  const text = await response.text();
  if (text.length > MOST_BYTES) throw new Error("That calendar is too large");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link isn't a calendar");
  return text;
}

const readers = {
  calendar(text) {
    const from = startOfToday();
    // Five weeks ahead, so the week view can scroll past this week.
    return readCalendar(text, from, new Date(from.getTime() + (7 * WEEKS_AHEAD + 1) * DAY));
  },
  assignments(text) {
    const from = new Date(startOfToday().getTime() - 14 * DAY);
    return readCalendar(text, from, new Date(from.getTime() + 134 * DAY))
      .filter((e) => !NOT_A_DEADLINE.test(e.title))
      .map((e) => ({
        id: `brightspace/${e.id}`, title: e.title.replace(DUE_WORDING, ""),
        // Brightspace puts the course's name in the location, which makes a ready category.
        due: e.start, detail: "Brightspace", course: e.place,
      }));
  },
};

export function createSources(store) {
  // The last good copy is saved, so a reboot with no internet still has your schedule.
  const saved = store.data.cache ?? {};
  const state = {
    calendar: { items: [], updated: 0, error: "", ...saved.calendar },
    assignments: { items: [], updated: 0, error: "", ...saved.assignments },
  };

  async function refresh(kind) {
    const link = store.data.links[kind];
    const source = state[kind];
    if (!link) {
      Object.assign(source, { items: [], updated: 0, error: "" });
      delete store.data.cache?.[kind];
      return;
    }
    // A slow answer for a link that has since been replaced must not overwrite the new one.
    const replaced = () => store.data.links[kind] !== link;
    try {
      const items = readers[kind](await download(link));
      if (replaced()) return;
      source.items = items;
      source.updated = Date.now();
      source.error = "";
      store.data.cache = { ...store.data.cache, [kind]: { items, updated: source.updated } };
      store.save();
    } catch (error) {
      if (replaced()) return;
      // The last good copy stays, so losing the network doesn't empty the board.
      source.error = error.name === "TimeoutError" ? "The link took too long to answer"
        : error.message === "fetch failed" ? "Couldn't reach that link" : error.message;
    }
  }

  const refreshAll = () => Promise.all(Object.keys(state).map(refresh));
  const stale = () => Object.keys(state).some((k) => store.data.links[k] && Date.now() - state[k].updated > REFRESH);
  const status = (kind) => ({
    connected: !!store.data.links[kind],
    count: state[kind].items.length,
    updated: state[kind].updated,
    error: state[kind].error,
  });

  return { state, refresh, refreshAll, stale, status };
}
