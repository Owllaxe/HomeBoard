// Reads the MTA's live subway feeds. They need no key and allow browser requests, so the
// board fetches them itself. They are GTFS-realtime protobuf, hence the small reader below,
// which only knows the fields used here.
window.MTA = (() => {
  const base = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
  const groups = [[["A", "C", "E", "H", "FS"], "-ace"], [["B", "D", "F", "M"], "-bdfm"], [["G"], "-g"],
    [["J", "Z"], "-jz"], [["L"], "-l"], [["N", "Q", "R", "W"], "-nqrw"], [["SI"], "-si"]];
  const feedOf = (line) => groups.find(([lines]) => lines.includes(line))?.[1] ?? "";
  const text = new TextDecoder();
  const HOUR = 3600;

  function* fields(bytes, start = 0, end = bytes.length) {
    let i = start;
    const varint = () => {
      let value = 0;
      let scale = 1;
      let byte;
      do {
        byte = bytes[i++];
        value += (byte & 127) * scale;
        scale *= 128;
      } while (byte & 128);
      return value;
    };
    while (i < end) {
      const key = varint();
      const type = key & 7;
      if (type === 0) {
        yield [key >> 3, varint()];
      } else if (type === 2) {
        const length = varint();
        yield [key >> 3, [i, i + length]];
        i += length;
      } else if (type === 1) {
        i += 8;
      } else if (type === 5) {
        i += 4;
      } else {
        return;
      }
    }
  }

  // FeedEntity.trip_update: 1 is the trip (1 id, 5 route), 2 each stop (4 id, 2 arrival, 3 departure)
  function readTripUpdate(bytes, span) {
    const trip = { stops: [] };
    for (const [no, value] of fields(bytes, ...span)) {
      if (no === 1) {
        for (const [k, v] of fields(bytes, ...value)) {
          if (k === 1) trip.id = text.decode(bytes.subarray(...v));
          if (k === 5) trip.line = text.decode(bytes.subarray(...v)).replace(/X$/, "");
        }
      } else if (no === 2) {
        const stop = {};
        for (const [k, v] of fields(bytes, ...value)) {
          if (k === 4) stop.stop = text.decode(bytes.subarray(...v));
          if (k === 2 || (k === 3 && !stop.time)) {
            for (const [j, t] of fields(bytes, ...v)) if (j === 2) stop.time = t;
          }
        }
        if (stop.stop && stop.time) trip.stops.push(stop);
      }
    }
    return trip;
  }

  function readFeed(buffer, trips) {
    const bytes = new Uint8Array(buffer);
    let stamp = 0;
    for (const [no, span] of fields(bytes)) {
      if (no === 1) {
        for (const [k, v] of fields(bytes, ...span)) if (k === 3) stamp = v;
      } else if (no === 2) {
        for (const [k, v] of fields(bytes, ...span)) {
          if (k !== 3) continue;
          const trip = readTripUpdate(bytes, v);
          (trips[trip.line] ??= []).push(trip);
        }
      }
    }
    return stamp;
  }

  // Keeps each feed's last good copy, so one failed request doesn't blank the map.
  // After three minutes it's too old to act on, and the board says so.
  const STALE = 180;
  const lastGood = new Map();
  async function load(lines) {
    const feeds = [...new Set([...lines].map(feedOf))];
    await Promise.all(feeds.map(async (feed) => {
      try {
        const response = await fetch(base + feed, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status);
        const trips = {};
        const stamp = readFeed(await response.arrayBuffer(), trips);
        lastGood.set(feed, { trips, stamp });
      } catch {
        // The age check below reports it if this keeps happening.
      }
    }));
    const live = feeds.map((feed) => lastGood.get(feed)).filter(Boolean);
    if (!live.length) throw new Error("No live train data");
    const newest = Math.max(...live.map((f) => f.stamp));
    if (Date.now() / 1000 - newest > STALE) throw new Error("Live train data is out of date");
    return {
      trips: Object.assign({}, ...live.map((f) => f.trips)),
      stamp: Math.min(...live.map((f) => f.stamp)),
    };
  }

  const stopTime = (trip, id) => trip.stops.find((s) => s.stop === id)?.time;

  // Trains that serve both ends of a leg, leaving its boarding stop at or after `earliest`.
  function rides(leg, trips, earliest) {
    const on = leg.stops[leg.board] + leg.dir;
    const off = leg.stops.at(-1) + leg.dir;
    return (trips[leg.line] ?? []).flatMap((trip) => {
      const dep = stopTime(trip, on);
      const end = stopTime(trip, off);
      return dep >= earliest && end > dep ? [{ trip, dep, end }] : [];
    }).sort((a, b) => a.dep - b.dep);
  }

  const TRANSFER = 180;

  // The latest train that still gets you there on time, or the first one if none can.
  function plan(route, trips, now, { arriveBy, extra = 0 }) {
    const walk = (route.walkTo + extra) * 60;
    const options = rides(route.legs[0], trips, now + walk).map((first) => {
      const steps = [first];
      for (const leg of route.legs.slice(1)) {
        const next = rides(leg, trips, steps.at(-1).end + TRANSFER)[0];
        if (!next) return null;
        steps.push(next);
      }
      return { steps, leaveAt: first.dep - walk, arriveAt: steps.at(-1).end + route.walkFrom * 60 };
    }).filter(Boolean);
    return options.filter((o) => o.arriveAt <= arriveBy).at(-1) ?? options[0] ?? null;
  }

  // Where a train is along a leg: 2.5 is halfway between stops[2] and stops[3], below 0 is
  // not on this stretch yet. Worked out from its predicted times, so it moves between updates.
  function position(leg, trip, now) {
    const times = leg.stops.map((id) => stopTime(trip, id + leg.dir));
    const next = times.findIndex((t) => t >= now);
    if (next < 0) return null;
    if (next === 0) return -(times[0] - now) / 120;
    const gap = Math.max(60, (times[next + 1] ?? times[next] + 120) - times[next]);
    return next - Math.min(1, (times[next] - now) / gap);
  }

  function trainsOn(leg, trips, now, mine) {
    return (trips[leg.line] ?? []).flatMap((trip) => {
      const at = position(leg, trip, now);
      return at === null ? [] : [{ id: trip.id, at, you: trip.id === mine }];
    });
  }

  const minutesAway = (trips, line, stop, now) => (trips[line] ?? [])
    .map((trip) => stopTime(trip, stop))
    .filter((t) => t >= now)
    .sort((a, b) => a - b)
    .slice(0, 3)
    .map((t) => Math.floor((t - now) / 60));

  // Service alerts. Only the ones that change a trip count, and only where they touch it:
  // planned work uptown on your line doesn't matter on a downtown ride.
  const ALERTS = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
  const HEADLINES = [[/^(Expect )?Delays/, "Delays"], [/^Reduced Service/, "Reduced service"], [/^Planned/, "Planned work"]];
  // How far ahead an alert with no end time is still worth mentioning
  const OPEN_ENDED = 3 * HOUR;
  let alerts = [];

  async function loadAlerts() {
    const response = await fetch(ALERTS, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status);
    const { entity = [] } = await response.json();
    alerts = entity.flatMap(({ alert }) => {
      const type = alert["transit_realtime.mercury_alert"]?.alert_type ?? "";
      const headline = HEADLINES.find(([pattern]) => pattern.test(type))?.[1];
      if (!headline) return [];
      const text = alert.header_text?.translation?.find((t) => t.language === "en")?.text ?? "";
      return [{
        headline, text: text.replace(/\[([^\]]+)\]/g, "$1"),
        periods: alert.active_period ?? [], where: alert.informed_entity ?? [],
      }];
    });
  }

  const running = (alert, at, now) => alert.periods.some((p) => p.start <= at
    && (p.end ? p.end >= at : at - now <= OPEN_ENDED));

  function touches(alert, leg) {
    const ride = new Set(leg.stops.slice(leg.board));
    return alert.where.some((e) => e.route_id?.replace(/X$/, "") === leg.line
      && (e.direction_id === undefined || (e.direction_id === 1 ? "S" : "N") === leg.dir)
      && (!e.stop_id || ride.has(e.stop_id.replace(/[NS]$/, ""))));
  }

  // The alert that matters most for a route at the time you'd be on it. Delays come first
  // because they're happening now and planned work is usually already in the times.
  function alertFor(route, at, now) {
    for (const [, headline] of HEADLINES) {
      for (const leg of route.legs) {
        const found = alerts.find((a) => a.headline === headline && running(a, at, now) && touches(a, leg));
        if (found) return { headline: `${headline} on the ${Routes.label(leg.line)}`, text: found.text };
      }
    }
    return null;
  }

  return { load, plan, trainsOn, minutesAway, loadAlerts, alertFor };
})();
