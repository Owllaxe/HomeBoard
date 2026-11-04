// Builds public/mta-network.js: the whole subway system, for routing and the map.
// Get gtfs_subway.zip from https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip and extract it.
// Save the city's borough outlines as boroughs.geojson in the same folder, from
// https://data.cityofnewyork.us/resource/gthc-hcne.geojson?$limit=5 then:
//   node tools/build-network.mjs <that folder>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const rows = (file) => readFileSync(join(dir, file), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const parent = (id) => id.replace(/[NS]$/, "");
const round = ([lat, lon]) => [+lat.toFixed(5), +lon.toFixed(5)];

// Drops points that barely change a line's shape (Ramer-Douglas-Peucker).
function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts.at(-1);
  const span = Math.hypot(bx - ax, by - ay) || 1e-9;
  let far = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const away = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / span;
    if (away > far) { far = away; index = i; }
  }
  if (far <= tolerance) return [pts[0], pts.at(-1)];
  return [...simplify(pts.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(pts.slice(index), tolerance)];
}

const stops = {};
for (const [id, name, lat, lon, type] of rows("stops.txt")) {
  if (type === "1") stops[id] = [name, +(+lat).toFixed(5), +(+lon).toFixed(5)];
}

// Stations you can walk between inside the system
const links = {};
for (const [from, to] of rows("transfers.txt")) {
  if (from !== to) (links[from] ??= []).push(to);
}

const shapes = new Map();
for (const [id, , lat, lon] of rows("shapes.txt")) {
  if (!shapes.has(id)) shapes.set(id, []);
  shapes.get(id).push([+lat, +lon]);
}

// A trip's stops and times, weekday service only
const trips = new Map();
for (const [routeId, tripId, service, headsign, direction, shape] of rows("trips.txt")) {
  if (service === "Weekday") trips.set(tripId, { line: routeId.replace(/X$/, ""), dir: direction === "1" ? "S" : "N", headsign, shape, calls: [] });
}
const seconds = (t) => t.split(":").reduce((sum, part) => sum * 60 + +part, 0);
for (const [tripId, stopId, arrival] of rows("stop_times.txt")) {
  trips.get(tripId)?.calls.push([parent(stopId), seconds(arrival)]);
}

// One pattern for each stopping sequence that runs at least a tenth of a line's trips
const groups = new Map();
for (const trip of trips.values()) {
  const key = `${trip.line}/${trip.dir}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const sequence = trip.calls.map(([id]) => id).join();
  const group = groups.get(key);
  if (!group.has(sequence)) group.set(sequence, []);
  group.get(sequence).push(trip);
}
const patterns = [];
const segments = {};
for (const group of groups.values()) {
  const total = [...group.values()].reduce((sum, list) => sum + list.length, 0);
  for (const list of group.values()) {
    if (list.length < total / 10) continue;
    const trip = list[Math.floor(list.length / 2)];
    const start = trip.calls[0][1];
    patterns.push({
      line: trip.line, dir: trip.dir, to: trip.headsign,
      stops: trip.calls.map(([id]) => id),
      mins: trip.calls.map(([, t]) => Math.round((t - start) / 6) / 10),
    });
    // The track between each pair of stops, shared by every line that runs on it
    const shape = shapes.get(trip.shape) ?? [];
    let from = 0;
    trip.calls.slice(1).forEach(([id], i) => {
      const a = trip.calls[i][0];
      const key = [a, id].sort().join("|");
      const [, lat, lon] = stops[id];
      let to = from;
      for (let j = from; j < shape.length; j++) {
        if (Math.hypot(shape[j][0] - lat, shape[j][1] - lon) < Math.hypot(shape[to][0] - lat, shape[to][1] - lon)) to = j;
        if (j > to + 80) break;
      }
      if (!segments[key] && to > from) {
        const inner = simplify(shape.slice(from, to + 1), .00012).slice(1, -1).map(round);
        segments[key] = a < id ? inner : inner.reverse();
      } else if (!segments[key]) {
        segments[key] = [];
      }
      from = to;
    });
  }
}

// Borough outlines, without the small islands the map doesn't need
const land = [];
const boroughs = JSON.parse(readFileSync(join(dir, "boroughs.geojson"), "utf8"));
for (const feature of boroughs.features) {
  for (const [ring] of feature.geometry.coordinates) {
    if (ring.length < 300) continue;
    // A ring starts and ends on one point, so each half is simplified on its own.
    const pts = ring.map(([lon, lat]) => [lat, lon]);
    const half = Math.floor(pts.length / 2);
    const outline = [...simplify(pts.slice(0, half + 1), .0005).slice(0, -1), ...simplify(pts.slice(half), .0005)];
    land.push(outline.map(([lat, lon]) => [+lat.toFixed(4), +lon.toFixed(4)]));
  }
}

writeFileSync(join(import.meta.dirname, "..", "public", "mta-network.js"),
  `// Generated by tools/build-network.mjs from MTA and NYC open data. Don't edit by hand.\n` +
  `window.MTA_NETWORK = ${JSON.stringify({ stops, links, patterns, segments, land })};\n`);
console.log(`${Object.keys(stops).length} stations, ${patterns.length} patterns, ${Object.keys(segments).length} track segments, ${land.length} land shapes`);
console.log([...new Set(patterns.map((p) => p.line))].join(" "));
