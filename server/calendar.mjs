// Reads an iCal feed into plain events, expanding repeats like a weekly class.
import ICAL from "ical.js";

const MOST_REPEATS = 20000;

function plain(uid, details, allDay) {
  const start = details.startDate;
  return {
    id: `${uid}/${start.toString()}`,
    title: details.item.summary?.trim() || "Untitled",
    place: details.item.location?.trim() ?? "",
    start: start.toJSDate().getTime(),
    end: details.endDate.toJSDate().getTime(),
    allDay,
  };
}

const cancelled = (event) => event.component.getFirstPropertyValue("status") === "CANCELLED";

export function readCalendar(text, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents("vtimezone").forEach((zone) => ICAL.TimezoneService.register(zone));

  const main = [];
  const changed = [];
  root.getAllSubcomponents("vevent").forEach((component) => {
    (component.hasProperty("recurrence-id") ? changed : main).push(component);
  });

  const events = [];
  for (const component of main) {
    const event = new ICAL.Event(component);
    if (cancelled(event)) continue;
    changed.filter((c) => c.getFirstPropertyValue("uid") === event.uid)
      .forEach((c) => event.relateException(new ICAL.Event(c)));
    const allDay = event.startDate.isDate;

    if (!event.isRecurring()) {
      const details = { item: event, startDate: event.startDate, endDate: event.endDate };
      if (details.endDate.toJSDate() >= from && details.startDate.toJSDate() <= to) {
        events.push(plain(event.uid, details, allDay));
      }
      continue;
    }

    const repeats = event.iterator();
    for (let i = 0, next = repeats.next(); next && i < MOST_REPEATS; i++, next = repeats.next()) {
      const details = event.getOccurrenceDetails(next);
      if (details.startDate.toJSDate() > to) break;
      if (details.endDate.toJSDate() >= from && !cancelled(details.item)) {
        events.push(plain(event.uid, details, allDay));
      }
    }
  }
  return events.sort((a, b) => a.start - b.start);
}
