// The board's server: serves public/ and answers the /api routes the page calls.
import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { createAccess } from "./access.mjs";
import { aiAvailable, getJob, startJob } from "./ai.mjs";
import { createChat } from "./chat.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
};
const MOST_BODY = 1024 * 1024;
const AI_DAYS = 8;

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

// Only JSON is accepted, which also stops another website posting here from your browser.
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      reject(new Error("Send JSON"));
      return;
    }
    let body = "";
    req.on("data", (part) => {
      body += part;
      if (body.length > MOST_BODY) reject(new Error("Too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Not valid JSON"));
      }
    });
  });
}

export function createApp({ root: publicFolder, store, sources }) {
  const { data } = store;
  const root = resolve(publicFolder);
  // Changes when the server restarts or the page's files are updated, so an open board knows
  // to reload itself and pick up the new version.
  const started = Date.now();
  function version() {
    const newest = Math.max(0, ...readdirSync(root).map((name) => {
      try { return statSync(join(root, name)).mtimeMs; } catch { return 0; }
    }));
    return `${started}-${Math.round(newest)}`;
  }
  // Repeating changes: rules like "every Math Class at 8 pm starts at 7 pm", from a day on.
  data.changes.series ??= [];

  const access = createAccess(store);

  // Every task with its category and milestones laid over it. A course from Brightspace is
  // the category until one is chosen.
  function everyTask() {
    return [...data.tasks, ...sources.state.assignments.items].map((t) => {
      const info = data.taskInfo[t.id] ?? {};
      return {
        ...t, category: "category" in info ? info.category : t.course ?? "", steps: info.steps ?? [],
        ...("due" in info ? { due: info.due } : {}),
      };
    });
  }
  const allTasks = () => everyTask().filter((t) => !data.done.includes(t.id));

  // Finished in the last two weeks, newest first, so a task ticked by mistake can come back.
  const RECENTLY = 14 * 86400000;
  const MOST_DONE_SHOWN = 30;
  const recentlyDone = () => everyTask()
    .filter((t) => data.done.includes(t.id) && (data.doneAt[t.id] ?? 0) > Date.now() - RECENTLY)
    .map((t) => ({ ...t, doneAt: data.doneAt[t.id] }))
    .sort((a, b) => b.doneAt - a.doneAt)
    .slice(0, MOST_DONE_SHOWN);

  // The calendar with the AI's changes laid over it.
  // A calendar event that a repeating change covers moves to the rule's time, on its own day.
  const simple = (title) => String(title).toLowerCase().replace(/[^a-z0-9]/g, "");
  function repeated(event) {
    if (event.allDay) return event;
    const day = new Date(event.start);
    const rule = data.changes.series.find((r) => r.key === simple(event.title) && event.start >= r.since
      && (r.weekday === null || day.getDay() === r.weekday)
      && (!r.from || (day.getHours() === r.from[0] && day.getMinutes() === r.from[1])));
    if (!rule) return event;
    const start = new Date(event.start).setHours(rule.to[0], rule.to[1], 0, 0);
    return { ...event, start, end: start + (event.end - event.start) };
  }

  function allEvents() {
    const { add, move, hide } = data.changes;
    return [...sources.state.calendar.items.map(repeated), ...add]
      .filter((e) => !hide.includes(e.id))
      .map((e) => ({ ...e, ...move[e.id] }))
      .sort((a, b) => a.start - b.start);
  }

  function board(req) {
    if (sources.stale()) sources.refreshAll();
    return {
      events: allEvents(),
      tasks: allTasks(),
      recentlyDone: recentlyDone(),
      settings: data.settings,
      categories: data.categories,
      sources: { calendar: sources.status("calendar"), assignments: sources.status("assignments") },
      repeating: data.changes.series.map((r) => ({ id: r.id, text: seriesText(r) })),
      version: version(),
      ai: { available: aiAvailable() },
      ...(access.isLocal(req) ? { access: access.details(req.socket.localPort) } : {}),
    };
  }

  function addTask({ title, due = null, detail = "" }) {
    const name = String(title ?? "").trim();
    if (!name) throw new Error("A task needs a name");
    const task = { id: `task/${randomUUID()}`, title: name.slice(0, 200), due: Number.isFinite(due) ? due : null, detail: String(detail).slice(0, 200) };
    data.tasks.push(task);
    return task;
  }

  const when = (t) => (Number.isFinite(t) ? t : null);
  const MOST_STEPS = 30;
  const MOST_CATEGORIES = 30;
  const label = (text, most) => String(text ?? "").trim().slice(0, most);

  // A task's category and milestones. Either can be sent alone.
  function setTaskInfo(id, { category, steps }) {
    if (!everyTask().some((t) => t.id === id)) throw new Error("That task isn't on the board");
    const info = { ...data.taskInfo[id] };
    if (category !== undefined) info.category = label(category, 40);
    if (steps !== undefined) {
      if (!Array.isArray(steps)) throw new Error("Milestones should be a list");
      info.steps = steps.slice(0, MOST_STEPS).map((s) => ({
        id: label(s.id, 60) || randomUUID(), title: label(s.title, 200), due: when(s.due), done: !!s.done,
      })).filter((s) => s.title);
    }
    data.taskInfo[id] = info;
  }

  // Every category in use, with the ones you made first.
  const categoryNames = () => [...new Set([...data.categories.map((c) => c.name), ...allTasks().map((t) => t.category).filter(Boolean)])];

  // What an AI result does to the board. See ai.mjs for the shape.
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const clockOf = ([h, m]) => new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const seriesText = (r) => `Every ${r.title}${r.weekday === null ? "" : ` on ${DAY_NAMES[r.weekday]}s`}${r.from ? ` at ${clockOf(r.from)}` : ""} now starts at ${clockOf(r.to)}, from ${new Date(r.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })} on`;
  const isClock = (t) => Array.isArray(t) && t.length === 2 && t.every(Number.isInteger) && t[0] >= 0 && t[0] < 24 && t[1] >= 0 && t[1] < 60;

  function applyResult({ answer, tasks = [], places = [], add = [], move = [], hide = [], sort = [], redate = [], finish = [], series = [] }) {
    const added = tasks.map(addTask);
    // Repeating changes start today, so nothing already past is touched.
    const today = new Date().setHours(0, 0, 0, 0);
    const rules = series.filter((s) => label(s.title, 200) && isClock(s.to) && (s.from === null || isClock(s.from))
      && (s.weekday === null || (Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday < 7)))
      .map((s) => ({ id: randomUUID(), title: label(s.title, 200), key: simple(s.title), weekday: s.weekday, from: s.from, to: s.to, since: today }));
    rules.forEach((r) => {
      // A newer rule for the same class at the same time takes the older one's place.
      data.changes.series = data.changes.series.filter((o) => !(o.key === r.key && o.weekday === r.weekday && String(o.from) === String(r.from)));
      data.changes.series.push(r);
    });
    // Tasks it named: a category for each, a new due date, or done.
    const open = new Map(allTasks().map((t) => [t.id, t]));
    const sorted = sort.filter((s) => open.has(s.id) && label(s.category, 40));
    sorted.forEach((s) => {
      setTaskInfo(s.id, { category: s.category });
      // A new category is kept, so it shows on the tasks page and gets a color.
      if (!data.categories.some((c) => c.name === label(s.category, 40))) data.categories.push({ name: label(s.category, 40), color: "" });
    });
    const redated = redate.filter((r) => open.has(r.id) && when(r.due));
    redated.forEach((r) => { data.taskInfo[r.id] = { ...data.taskInfo[r.id], due: r.due }; });
    const finished = finish.filter((id) => open.has(id) && !data.done.includes(id));
    finished.forEach((id) => {
      data.done.push(id);
      data.doneAt[id] = Date.now();
    });
    const settings = (data.settings ??= {});
    settings.places ??= {};
    places.forEach(({ name, place }) => {
      if (settings.places[place] && !settings.places[name]) settings.places[name] = settings.places[place];
    });
    const newEvents = add.filter((e) => when(e.start) && when(e.end)).map((e) => ({
      id: `added/${randomUUID()}`, title: String(e.title ?? "Untitled").slice(0, 200),
      place: String(e.place ?? "").slice(0, 200), start: e.start, end: e.end, allDay: false,
    }));
    data.changes.add.push(...newEvents);
    const before = new Map(allEvents().map((e) => [e.id, e]));
    const moved = move.filter((m) => before.has(m.id) && when(m.start) && when(m.end));
    moved.forEach((m) => { data.changes.move[m.id] = { start: m.start, end: m.end }; });
    const hidden = hide.filter((id) => before.has(id));
    data.changes.hide.push(...hidden);
    store.save();
    // Names exactly what changed, so a wrong change is easy to spot.
    const at = (ms) => new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const did = [
      ...added.map((t) => `Added task: ${t.title}${t.due ? `, due ${at(t.due)}` : ""}`),
      ...newEvents.map((e) => `Added ${e.title}, ${at(e.start)}`),
      ...moved.map((m) => `Moved ${before.get(m.id).title} to ${at(m.start)}`),
      ...hidden.map((id) => `Took ${before.get(id).title} off the board`),
      ...sorted.map((s) => `Put ${open.get(s.id).title} in ${label(s.category, 40)}`),
      ...redated.map((r) => `${open.get(r.id).title} is now due ${at(r.due)}`),
      ...finished.map((id) => `Marked done: ${open.get(id).title}`),
      ...rules.map(seriesText),
    ].join(". ");
    return { answer: answer ?? "", added: added.length, summary: [answer, did].filter(Boolean).join(" ") || "Done, nothing to change." };
  }

  const contextFor = () => ({
    // The AI sees the next 8 days only: a longer list is slower on a Pi and easier to misread.
    now: Date.now(), events: allEvents().filter((e) => e.start < Date.now() + AI_DAYS * 86400000),
    tasks: allTasks(), categories: categoryNames(), places: data.settings?.places ?? {},
  });
  const chat = createChat({ store, contextFor, applyResult });
  chat.next();

  async function api(req, res, path) {
    const route = `${req.method} ${path}`;
    if (route === "POST /api/pair") {
      const { code } = await readJson(req);
      const cookie = access.pair(code);
      if (!cookie) {
        send(res, 403, { error: "That code isn't right" });
        return;
      }
      res.setHeader("set-cookie", cookie);
      send(res, 200, { ok: true });
      return;
    }
    if (!access.allowed(req)) {
      send(res, 401, { error: "Enter the code from the board's menu" });
      return;
    }
    if (route === "GET /api/board") {
      send(res, 200, board(req));
      return;
    }
    const skipped = path.match(/^\/api\/events\/(.+)\/skip$/);
    if (req.method === "POST" && skipped) {
      const { skip } = await readJson(req);
      data.changes.hide = data.changes.hide.filter((id) => id !== skipped[1]);
      if (skip) data.changes.hide.push(skipped[1]);
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    if (route === "GET /api/chat") {
      send(res, 200, chat.view());
      return;
    }
    if (route === "POST /api/chat") {
      const { text, kind } = await readJson(req);
      chat.add(text, kind);
      send(res, 201, chat.view());
      return;
    }
    const again = path.match(/^\/api\/chat\/([\w-]+)\/retry$/);
    if (req.method === "POST" && again) {
      chat.retry(again[1]);
      send(res, 200, chat.view());
      return;
    }
    if (route === "PUT /api/settings") {
      data.settings = await readJson(req);
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    if (route === "PUT /api/links") {
      const links = await readJson(req);
      const kinds = Object.keys(links).filter((k) => k in data.links);
      for (const kind of kinds) {
        const link = String(links[kind]).trim();
        if (link && !/^(https?|webcal):\/\//i.test(link)) {
          send(res, 400, { error: "That doesn't look like a link" });
          return;
        }
        data.links[kind] = link;
      }
      store.save();
      await Promise.all(kinds.map(sources.refresh));
      send(res, 200, board(req));
      return;
    }
    if (route === "POST /api/tasks") {
      const body = await readJson(req);
      const task = addTask(body);
      if (body.category) setTaskInfo(task.id, { category: body.category });
      store.save();
      send(res, 201, task);
      return;
    }
    const info = path.match(/^\/api\/tasks\/(.+)\/info$/);
    if (req.method === "PUT" && info) {
      setTaskInfo(info[1], await readJson(req));
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    // Each category is { name, color }. A course's category only appears here once it's given
    // a color, so the list is only the ones you've made or changed.
    if (route === "PUT /api/categories") {
      const list = await readJson(req);
      if (!Array.isArray(list)) throw new Error("Categories should be a list");
      const seen = new Set();
      data.categories = list.map((c) => ({
        name: label(c?.name, 40), color: /^#[0-9a-f]{6}$/i.test(c?.color) ? c.color : "",
      })).filter((c) => c.name && !seen.has(c.name) && seen.add(c.name)).slice(0, MOST_CATEGORIES);
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    const unrepeat = path.match(/^\/api\/repeating\/([\w-]+)\/remove$/);
    if (req.method === "POST" && unrepeat) {
      data.changes.series = data.changes.series.filter((r) => r.id !== unrepeat[1]);
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    const finished = path.match(/^\/api\/tasks\/(.+)\/done$/);
    if (req.method === "POST" && finished) {
      const id = decodeURIComponent(finished[1]);
      const { done } = await readJson(req);
      data.done = data.done.filter((d) => d !== id);
      delete data.doneAt[id];
      if (done) {
        data.done.push(id);
        data.doneAt[id] = Date.now();
      }
      store.save();
      send(res, 200, { ok: true });
      return;
    }
    if (route === "POST /api/ask") {
      if (!aiAvailable()) {
        send(res, 503, { error: "The AI isn't connected" });
        return;
      }
      const { text } = await readJson(req);
      const context = { ...contextFor(), kind: "chat", history: [] };
      send(res, 202, { job: startJob(String(text), context, applyResult) });
      return;
    }
    const asked = path.match(/^\/api\/ask\/([\w-]+)$/);
    if (req.method === "GET" && asked) {
      const job = getJob(asked[1]);
      send(res, job ? 200 : 404, job ?? { error: "No such request" });
      return;
    }
    send(res, 404, { error: "Not found" });
  }

  const pages = { "/": "/index.html", "/send": "/send.html" };

  return createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path.startsWith("/api/")) {
      if (!access.hostAllowed(req)) {
        send(res, 403, { error: "Open the board by its address" });
        return;
      }
      try {
        await api(req, res, path);
      } catch (error) {
        send(res, 400, { error: error.message });
      }
      return;
    }
    const file = join(root, normalize(pages[path] ?? path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}
