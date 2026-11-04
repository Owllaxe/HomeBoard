// Finds ways between any two stations, direct or with one transfer, from the MTA's stopping
// patterns. Times here are typical. mta.js fills in the real trains.
window.Routes = (() => {
  const { stops, links, patterns } = window.MTA_NETWORK;
  const WAIT = 5; // Typical minutes lost to a transfer
  const BEFORE = 5; // Stops kept before you board, so trains heading for you are on the map
  const MOST = 6;

  const calls = new Map();
  patterns.forEach((p) => p.stops.forEach((id, i) => {
    if (!calls.has(id)) calls.set(id, []);
    calls.get(id).push([p, i]);
  }));
  const complex = (id) => [id, ...(links[id] ?? [])];
  const name = (id) => stops[id]?.[0] ?? id;
  const label = (line) => ({ GS: "S", FS: "S", H: "S" })[line] ?? line;

  const leg = (p, on, off) => {
    const start = Math.max(0, on - BEFORE);
    return { line: p.line, dir: p.dir, stops: p.stops.slice(start, off + 1), board: on - start };
  };

  // Straight-line distance in km, for telling when walking beats the train
  function distance(a, b) {
    const [, latA, lonA] = stops[a];
    const [, latB, lonB] = stops[b];
    return Math.hypot((latA - latB) * 111.2, (lonA - lonB) * 84.4);
  }

  function find(homes, spots) {
    const found = new Map();
    const direct = new Set();
    const add = (home, spot, steps) => {
      const lines = steps.map(([p]) => p.line);
      const ride = steps.reduce((sum, [p, on, off]) => sum + p.mins[off] - p.mins[on], 0);
      const score = home.walk + ride + spot.walk + WAIT * (steps.length - 1);
      // Transfers at the same station are one choice, so 2+R and 3+R don't fill the row.
      const key = steps.length > 1 ? `via ${steps[0][0].stops[steps[0][2]]}` : lines[0];
      if (steps.length === 1) direct.add(lines[0]);
      if (found.has(key) && found.get(key).score <= score) return;
      const board = steps[0][0].stops[steps[0][1]];
      found.set(key, {
        id: `${lines.join("-")}-${board}`, via: name(board), lines: lines.map(label), plan: steps.length > 1 ? "1 transfer" : "Direct",
        walkTo: home.walk, walkFrom: spot.walk, ride: Math.round(ride + WAIT * (steps.length - 1)), score,
        legs: steps.map(([p, on, off]) => leg(p, on, off)),
      });
    };

    for (const home of homes) {
      for (const spot of spots) {
        const arrivals = new Map();
        complex(spot.stop).forEach((end) => (calls.get(end) ?? []).forEach(([p, i]) => {
          arrivals.set(p, [...(arrivals.get(p) ?? []), i]);
        }));
        const stopAfter = (p, i) => arrivals.get(p)?.find((j) => j > i);
        complex(home.stop).forEach((start) => (calls.get(start) ?? []).forEach(([p, on]) => {
          const off = stopAfter(p, on);
          if (off !== undefined) {
            add(home, spot, [[p, on, off]]);
            return;
          }
          for (let change = on + 1; change < p.stops.length; change++) {
            complex(p.stops[change]).forEach((across) => (calls.get(across) ?? []).forEach(([q, k]) => {
              const end = q.line === p.line ? undefined : stopAfter(q, k);
              if (end !== undefined) add(home, spot, [[p, on, change], [q, k, end]]);
            }));
          }
        }));
      }
    }

    const ranked = [...found.values()]
      .filter((r) => r.legs.length === 1 || !r.legs.some((l) => direct.has(l.line)))
      .sort((a, b) => a.score - b.score);
    const best = ranked[0]?.score ?? Infinity;
    const lineSets = new Set();
    const routes = ranked.filter((r) => {
      const lines = r.lines.join();
      if (r.score > best * 1.5 + 5 || lineSets.has(lines)) return false;
      lineSets.add(lines);
      return true;
    }).slice(0, MOST);

    // Walking only earns a place when it's a short trip
    const walks = homes.flatMap((home) => spots.map((spot) => Math.round(distance(home.stop, spot.stop) * 1.3 / .08)));
    const walk = Math.min(...walks);
    if (walk <= 30) {
      routes.push({ id: "walk", via: "Walk", lines: [], plan: `${walk} min on foot`, walk: `${walk} min`, walkTo: walk, walkFrom: 0, ride: 0, score: walk, legs: [] });
    }
    return routes.sort((a, b) => a.score - b.score);
  }

  // One entry per station, counting a connected complex as a single station.
  const stations = (() => {
    const seen = new Set();
    const list = [];
    Object.keys(stops).forEach((id) => {
      if (seen.has(id)) return;
      const members = complex(id);
      members.forEach((m) => seen.add(m));
      const lines = [...new Set(members.flatMap((m) => (calls.get(m) ?? []).map(([p]) => label(p.line))))]
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      if (lines.length) list.push({ stop: id, name: name(id), names: members.map(name).join(" ").toLowerCase(), lines });
    });
    return list;
  })();

  const search = (text) => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return stations.filter((s) => s.names.includes(q))
      .sort((a, b) => b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) || a.name.localeCompare(b.name));
  };

  const station = (stop) => stations.find((s) => complex(stop).includes(s.stop)) ?? stations.find((s) => s.stop === stop);

  return { find, search, station, name, label };
})();
