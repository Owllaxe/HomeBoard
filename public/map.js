// Draws every way to an event on a map of the city, using the MTA's real stations and track
// and the city's borough outlines. Self-contained SVG, so the wall needs no map tiles.
// A route's `legs` are stretches of line: { line, stops: [station ids in travel order],
// board: index, trains: [{ id, at, you }] }, where 2.5 is halfway between stops[2] and stops[3].
window.BoardMap = (() => {
  const { stops, segments, land } = window.MTA_NETWORK;
  const WIDTH = 640;
  const HEIGHT = 540;
  const WIDE = .758; // A degree of longitude is this much shorter than one of latitude here
  const CLOSEST = 15500; // Map units per degree, so a short trip isn't drawn absurdly large

  const newJersey = [[40.92, -73.92], [40.78, -74.012], [40.75, -74.025], [40.735, -74.03], [40.72, -74.035], [40.71, -74.035],
    [40.7, -74.045], [40.69, -74.055], [40.66, -74.07], [40.6, -74.14], [40.6, -74.4], [40.92, -74.4]];
  const areas = [["Manhattan", 40.79, -73.965], ["Brooklyn", 40.655, -73.945], ["Queens", 40.725, -73.82],
    ["The Bronx", 40.85, -73.87], ["New Jersey", 40.735, -74.055], ["Staten Island", 40.58, -74.14]];

  // The whole map is fitted to whatever it has to show.
  let view = { lat: 40.7, lon: -74, scale: 7000 };
  const xy = ([lat, lon]) => [
    +(WIDTH / 2 + (lon - view.lon) * WIDE * view.scale).toFixed(1),
    +(HEIGHT / 2 - (lat - view.lat) * view.scale).toFixed(1),
  ];
  function fit(ids) {
    const lats = ids.map((id) => stops[id][1]);
    const lons = ids.map((id) => stops[id][2]);
    const [south, north] = [Math.min(...lats), Math.max(...lats)];
    const [west, east] = [Math.min(...lons), Math.max(...lons)];
    view = {
      lat: (south + north) / 2,
      lon: (west + east) / 2,
      scale: Math.min(CLOSEST, 430 / ((east - west) * WIDE || 1e-3), 420 / ((north - south) || 1e-3)),
    };
  }

  const point = (id) => xy(stops[id].slice(1));
  const name = (id) => stops[id]?.[0] ?? id;
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

  // A leg's track, split at each stop, along the line's real shape.
  function piece(a, b) {
    const inner = (segments[[a, b].sort().join("|")] ?? []).map(xy);
    return [point(a), ...(a < b ? inner : inner.reverse()), point(b)];
  }
  const track = (leg) => leg.stops.slice(1).map((id, i) => piece(leg.stops[i], id));

  const length = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

  function along(pts, fraction) {
    let left = length(pts) * fraction;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const step = Math.hypot(bx - ax, by - ay);
      if (left <= step) return step ? [ax + (bx - ax) * left / step, ay + (by - ay) * left / step] : [ax, ay];
      left -= step;
    }
    return pts.at(-1);
  }

  function markerStyle(leg, at) {
    const pieces = track(leg);
    if (at < 0 || at > pieces.length) return "display:none";
    const i = Math.min(Math.floor(at), pieces.length - 1);
    const [x, y] = along(pieces[i], at - i);
    return `transform:translate(${x}px,${y}px)`;
  }

  // Names sit on the side with room, and a name that would land on another is left out.
  function labeller() {
    const taken = [];
    return (x, y, text, cls, force) => {
      const side = x > 470 ? "end" : "start";
      const shift = side === "end" ? -13 : 13;
      if (!force && taken.some(([a, b]) => Math.abs(b - y) < 17 && Math.abs(a - x) < 170)) return "";
      taken.push([x, y]);
      return `<text class="${cls}" x="${x + shift}" y="${y + 5}" text-anchor="${side}">${text}</text>`;
    };
  }

  const walksOf = (route, home, end) => (route.legs.length
    ? [[home, point(route.legs[0].stops[route.legs[0].board])], [point(route.legs.at(-1).stops.at(-1)), end]]
    : [[home, end]]);

  // An option you haven't picked: grey, with its line letter at the stop you'd board at.
  function greyRoute(route, home, end) {
    const rides = route.legs.map((l) => path(track(l).slice(l.board).flat()));
    const walks = walksOf(route, home, end).map(([a, b]) => `<path class="map-grey-walk" d="${path([a, b])}"/>`);
    const tags = route.legs.map((l) => {
      const [x, y] = point(l.stops[l.board]);
      return `<g class="map-grey-tag" style="transform:translate(${x}px,${y}px)"><circle r="11"/><text y="5" text-anchor="middle">${Routes.label(l.line)}</text></g>`;
    });
    return `<g class="map-grey" data-route="${route.id}">${walks.join("")}${rides.map((d) =>
      `<path class="map-grey-line" d="${d}"/><path class="map-hit" d="${d}"/>`).join("")}${tags.join("")}</g>`;
  }

  function pickedRoute(route, home, end, colorOf) {
    let lines = "";
    let dots = "";
    let keyNames = "";
    let names = "";
    const named = labeller();
    route.legs.forEach((l, n) => {
      const pieces = track(l);
      const color = colorOf(l.line);
      const ride = path(pieces.slice(l.board).flat());
      if (l.board) lines += `<path class="map-ahead" d="${path(pieces.slice(0, l.board).flat())}" style="stroke:${color}"/>`;
      lines += `<path class="map-casing" d="${ride}"/><path class="map-ride" d="${ride}" style="stroke:${color}"/>`;
      l.stops.forEach((id, i) => {
        if (i < l.board) return;
        const [x, y] = point(id);
        const key = i === l.board || i === l.stops.length - 1;
        dots += `<circle class="map-stop${key ? " is-key" : ""}" cx="${x}" cy="${y}" r="${key ? 7 : 4.5}"/>`;
        // A transfer is named once, by the leg you arrive on.
        if (key && !(n && i === l.board)) keyNames += named(x, y, name(id), "map-name is-key", true);
      });
    });
    route.legs.forEach((l) => l.stops.forEach((id, i) => {
      if (i <= l.board || i === l.stops.length - 1) return;
      const [x, y] = point(id);
      names += named(x, y, name(id), "map-name");
    }));
    const walks = walksOf(route, home, end).map(([a, b]) => `<path class="map-walk" d="${path([a, b])}"/>`).join("");
    return walks + lines + dots + keyNames + names;
  }

  function trainMarker(leg, n, t, colorOf, fgOf) {
    const c = colorOf(leg.line);
    const tag = t.you ? `<text class="map-yours" x="-21" y="5" text-anchor="end">Yours</text>` : "";
    return `<g class="map-train${t.you ? " is-yours" : ""}" data-leg="${n}" data-train="${t.id}" style="${markerStyle(leg, t.at)}">
      <circle r="${t.you ? 15 : 11}" style="fill:${c}"/>
      <text y="${t.you ? 6 : 5}" text-anchor="middle" style="fill:${fgOf(c)}">${Routes.label(leg.line)}</text>${tag}
    </g>`;
  }

  // `trip` says where Home and the destination are: { homes: [station ids], dest: id, place }.
  function draw(svg, routes, picked, trip, colorOf, fgOf) {
    fit([...trip.homes, trip.dest, ...routes.flatMap((r) => r.legs.flatMap((l) => l.stops.slice(l.board)))]);
    const homes = trip.homes.map(point);
    const home = [homes.reduce((s, p) => s + p[0], 0) / homes.length + 14, homes.reduce((s, p) => s + p[1], 0) / homes.length - 14];
    const [dx, dy] = point(trip.dest);
    const end = [dx + 14, dy - 14];
    const sideName = (x, y, text) => {
      const left = x > 470;
      return `<text class="map-name is-key" x="${x + (left ? -14 : 14)}" y="${y + 5}" text-anchor="${left ? "end" : "start"}">${text}</text>`;
    };
    svg.innerHTML =
      [newJersey, ...land].map((shape) => `<path class="map-land" d="${path(shape.map(xy))}Z"/>`).join("") +
      areas.map(([text, ...spot]) => {
        const [x, y] = xy(spot);
        return x > 30 && x < 560 && y > 24 && y < 516 ? `<text class="map-area" x="${x}" y="${y}">${text}</text>` : "";
      }).join("") +
      routes.filter((r) => r !== picked).map((r) => greyRoute(r, home, end)).join("") +
      pickedRoute(picked, home, end, colorOf) +
      `<rect class="map-home" x="${home[0] - 8}" y="${home[1] - 8}" width="16" height="16"/>` +
      sideName(home[0], home[1], "Home") +
      `<rect class="map-dest" x="${end[0] - 8}" y="${end[1] - 8}" width="16" height="16"/>` +
      sideName(end[0], end[1], trip.place) +
      picked.legs.map((l, n) => l.trains.map((t) => trainMarker(l, n, t, colorOf, fgOf)).join("")).join("");
  }

  // False when the trains on the line have changed, so the caller draws again.
  function move(svg, route) {
    const shown = [...svg.querySelectorAll(".map-train")];
    if (shown.length !== route.legs.reduce((sum, l) => sum + l.trains.length, 0)) return false;
    for (const g of shown) {
      const leg = route.legs[g.dataset.leg];
      const train = leg?.trains.find((t) => String(t.id) === g.dataset.train);
      if (!train) return false;
      g.style.cssText = markerStyle(leg, train.at);
    }
    return true;
  }

  return { draw, move, name };
})();
