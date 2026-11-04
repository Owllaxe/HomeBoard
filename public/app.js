// Runs the real board: events and tasks from the server, trains from the MTA, and the
// routes between them. Everything reaches the screen through Board.render(state).
window.BoardApp = (() => {
  const HOUR = 3600;
  const DAY_MS = 86400000;
  // MTA predictions reach about this far ahead, so later trips are estimates.
  const EXACT_WITHIN = 75 * 60;
  const ALERTS_EVERY = 3 * 60000;
  const WEATHER_EVERY = 30 * 60000;
  const WEATHER_GOOD_FOR = 3 * 3600000;
  // The week view scrolls through five weeks, as far as the calendar is read.
  const WEEK_DAYS = 35;

  let data = null;
  let feed = null;
  let feedFailed = false;
  let forecast = null;
  let serverDown = false;
  let onBoard = null;
  let timers = [];
  let lastMinute = -1;

  const parts = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).split(/\s/);
  const clock = (ms) => parts(ms)[0];
  const timeText = (ms) => parts(ms).join(" ").toLowerCase();
  const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);
  const shortDay = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "short" });
  const dayIndex = (ms, now) => Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);

  function dayLabel(ms, now) {
    const days = dayIndex(ms, now);
    if (days === 0) return "Today";
    if (days > 0 && days < 7) return shortDay(ms);
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Nowhere to travel to: "Online", "Zoom", or a link pasted in as the location.
  const ONLINE = /^(online|remote|virtual|zoom|webex|teams|microsoft teams|google meet)\b|^https?:/i;
  const isOnline = (event) => ONLINE.test(event.place.trim());

  // The name before the first comma: "Science Center, Main St" is Science Center.
  const placeOf = (event) => (isOnline(event) ? "Online" : event.place.split(",")[0].trim());

  const found = new Map();
  function waysTo(place) {
    const { places } = Board.settings;
    const homes = places.Home ?? [];
    const spots = places[place] ?? [];
    const key = JSON.stringify([homes, spots]);
    if (!found.has(key)) found.set(key, homes.length && spots.length ? Routes.find(homes, spots) : []);
    return found.get(key);
  }

  function liveRoute(way, start, now, extra) {
    const legs = way.legs.map((l) => ({ ...l, trains: [] }));
    const route = { ...way, legs };
    const arriveBy = start - 300;
    const usualLeave = arriveBy - (way.walkFrom + way.ride + way.walkTo + extra) * 60;
    const usual = {
      leave: clock(usualLeave * 1000), arrive: clock(arriveBy * 1000),
      leaveIn: Math.floor((usualLeave - now) / 60),
    };
    if (!legs.length) return { ...route, ...usual };
    const plan = feed && usualLeave - now < EXACT_WITHIN && MTA.plan(route, feed.trips, now, { arriveBy, extra });
    const alert = MTA.alertFor(route, plan?.leaveAt ?? usualLeave, now);
    const warned = alert ? { change: alert.headline, alertText: alert.text } : {};
    if (!plan) {
      const onBoardBy = usualLeave + way.walkTo * 60 + extra * 60;
      return { ...route, ...warned, ...usual, train: { line: way.lines[0], time: clock(onBoardBy * 1000) }, estimate: true };
    }
    const dep = plan.steps[0].dep * 1000;
    plan.steps.forEach((step, i) => { legs[i].mine = step.trip.id; });
    return {
      ...route,
      ...warned,
      train: { line: way.lines[0], time: clock(dep) },
      leave: clock(plan.leaveAt * 1000), arrive: clock(plan.arriveAt * 1000),
      leaveIn: Math.floor((plan.leaveAt - now) / 60),
      goNote: `${way.lines[0]} at ${clock(dep)}, ${way.walkTo} min walk to ${way.via}`,
    };
  }

  // Turns a calendar event into what the pass shows.
  function tripFor(event, now) {
    const nowSec = now / 1000;
    const place = placeOf(event);
    const soon = dayIndex(event.start, now) === 0;
    const base = { id: event.id, skippable: true, title: Board.shortName(event.title), starts: `${soon ? "" : `${shortDay(event.start)} `}${clock(event.start)}` };
    const blank = { routes: [], estimate: true, leave: "--", arrive: "--", leaveIn: 999 };
    if (!place) return { ...base, ...blank, place: "No location", noLocation: true, note: "This event has no location" };
    if (isOnline(event)) {
      // There's no leaving to do, so the stub counts down to the start instead.
      const leaveIn = Math.ceil((event.start - now) / 60000);
      return {
        ...base, place, routes: [], online: true, noLocation: true, leave: clock(event.start), leaveIn,
        ...(leaveIn > 60 ? { note: "Online, no need to leave" } : {}),
      };
    }

    const { places, extra } = Board.settings;
    const homes = (places.Home ?? []).map((s) => s.stop);
    const event2 = { ...base, place, homes, destStop: places[place]?.[0]?.stop };
    const routes = waysTo(place).map((way) => liveRoute(way, event.start / 1000, nowSec, Number(extra)));
    if (!routes.length) {
      return {
        ...event2, ...blank,
        note: homes.length ? "Tap to add this place's station" : "Tap to set your home station",
      };
    }
    // A pattern on paper may not be running tonight, so live trains decide what's offered.
    const running = routes.filter((r) => !r.estimate);
    const offered = running.length ? running : routes;
    if (!offered[0].estimate) return { ...event2, routes: offered };
    const when = soon ? "" : `${dayIndex(event.start, now) === 1 ? "Tomorrow" : shortDay(event.start)}. `;
    return { ...event2, routes: offered, estimate: true, note: `${when}Exact train closer to the time` };
  }

  // The next milestone still to do, soonest first. Ones with no date wait at the end.
  const nextStep = (steps) => steps.filter((s) => !s.done)
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))[0];

  // "2 of 4, next Tue", or nothing for a task without milestones.
  function progressOf(steps, now) {
    if (!steps.length) return "";
    const next = nextStep(steps);
    const count = `${steps.filter((s) => s.done).length} of ${steps.length}`;
    return next?.due ? `${count}, next ${dayLabel(next.due, now)}` : count;
  }

  // A task's day with its date: "Today", "Mon 9" this week, "Nov 20" further off.
  const monthDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  function dueLabel(ms, now) {
    const days = dayIndex(ms, now);
    if (days === 0) return "Today";
    if (days > 0 && days < 7) return `${shortDay(ms)} ${new Date(ms).getDate()}`;
    return monthDay(ms);
  }

  function taskRow(task, now) {
    const { due, detail } = task;
    const steps = task.steps ?? [];
    // A milestone due before the task brings the task up the list.
    const soonest = Math.min(due ?? Infinity, nextStep(steps)?.due ?? Infinity);
    // A late task still says when it was due.
    const late = due && due < now ? `Due ${monthDay(due)}` : "";
    const where = detail ? (due ? `${timeText(due)}, ${detail}` : detail) : "";
    return {
      id: task.id, kind: "todo", title: task.title, category: task.category ?? "",
      due: Number.isFinite(soonest) ? new Date(soonest).toISOString() : "9999",
      time: !due ? "Later" : due < now ? "Late" : dueLabel(due, now),
      detail: progressOf(steps, now) || [late, where].filter(Boolean).join(", "),
    };
  }

  // Everything the tasks page shows about each task, grouped by when it's due.
  function pageTask(task, now) {
    const { due } = task;
    const days = due ? dayIndex(due, now) : null;
    const group = !due ? "No date" : due < now ? "Late" : days === 0 ? "Today" : days < 7 ? "This week" : "Later";
    const when = due
      ? `Due ${new Date(due).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${timeText(due)}`
      : "No due date";
    return {
      // Under a Late heading, the date it was due says more than "Late" again.
      ...taskRow(task, now), group, when,
      ...(group === "Late" ? { time: dayLabel(due, now) } : group === "No date" ? { time: "" } : {}),
      from: task.id.startsWith("brightspace/") ? "From Brightspace" : task.detail ?? "",
      steps: (task.steps ?? []).map((s) => ({ ...s, when: s.due ? dayLabel(s.due, now) : "" })),
      progress: progressOf(task.steps ?? [], now),
    };
  }

  // A class in the week can be shown on the pass. One that has started says so, since its
  // leave time has gone.
  function weekPass(event, now) {
    if (event.allDay) return null;
    const trip = tripFor(event, now);
    if (event.start > now) return trip;
    return { ...trip, estimate: true, skippable: false, note: event.end > now ? "Happening now" : "Already over" };
  }

  function weekOf(events, tasks, now) {
    const today = startOfDay(now);
    return Array.from({ length: WEEK_DAYS }, (_, i) => {
      const day = new Date(today).setDate(new Date(today).getDate() + i);
      const items = [
        ...events.filter((e) => startOfDay(e.start) === day).map((e) => ({
          id: e.id, at: e.start, end: e.end, allDay: !!e.allDay, time: e.allDay ? "All day" : clock(e.start),
          title: e.title, event: weekPass(e, now),
        })),
        ...tasks.filter((t) => t.due && startOfDay(t.due) === day).map((t) => ({ at: t.due, due: true, time: timeText(t.due), title: t.title })),
      ].sort((a, b) => a.at - b.at);
      return { day: `${shortDay(day)} ${new Date(day).getDate()}`, start: day, items };
    });
  }

  const stamp = (seconds, withSeconds) => new Date(seconds * 1000)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) });

  // Says plainly when what's on screen might be out of date.
  function noticeNow() {
    if (serverDown && data) return "Can't reach the board's server. Showing the last copy.";
    const { calendar, assignments } = data?.sources ?? {};
    const old = [calendar, assignments].find((s) => s?.connected && s.error);
    if (!old) return null;
    return old.updated
      ? `Can't update your calendar. Showing the copy from ${stamp(old.updated / 1000)}.`
      : "Can't reach your calendar. Check the link in the menu.";
  }

  function liveState() {
    const now = Date.now();
    const events = data?.events ?? [];
    const timed = events.filter((e) => !e.allDay && e.start > now);
    const next = timed[0];
    const connected = data?.sources.calendar.connected;
    const empty = {
      id: "none", empty: true, title: "No events coming up", needsLinks: !connected,
      note: serverDown ? "Can't reach the board's server" : connected ? "Nothing on your calendar this week" : "Tap to connect your calendar",
    };
    const pass = next ? tripFor(next, now) : empty;
    const rowOf = (e) => (e.allDay
      ? { id: e.id, time: "All day", title: Board.shortName(e.title), detail: placeOf(e) }
      : { id: e.id, time: clock(e.start), title: Board.shortName(e.title), detail: placeOf(e), event: tripFor(e, now) });
    const todayRows = events
      .filter((e) => e !== next && dayIndex(e.start, now) === 0 && (e.allDay || e.start > now))
      .map(rowOf);
    // With nothing left today, the list says so and shows all of tomorrow underneath.
    const tomorrow = todayRows.length ? [] : events.filter((e) => dayIndex(e.start, now) === 1);
    const schedule = tomorrow.length ? [
      { id: "note/today", kind: "note", title: "Nothing else today" },
      { id: "head/tomorrow", kind: "head", title: `Tomorrow, ${new Date(tomorrow[0].start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` },
      ...tomorrow.map(rowOf),
    ] : todayRows;
    const hour = new Date(now).getHours();
    const strip = (pass.routes ?? []).filter((r) => r.legs.length).map((r) => {
      const l = r.legs[0];
      return { line: l.line, towards: r.via, mins: MTA.minutesAway(feed?.trips ?? {}, l.line, l.stops[l.board] + l.dir, now / 1000) };
    }).filter((t) => t.mins.length).slice(0, 2);
    return {
      now: clock(now),
      date: new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).replace(",", ""),
      night: hour >= 23 || hour < 6,
      pass,
      schedule,
      tasks: (data?.tasks ?? []).map((t) => taskRow(t, now)),
      allTasks: (data?.tasks ?? []).map((t) => pageTask(t, now)),
      doneTasks: (data?.recentlyDone ?? []).map((t) => ({
        ...pageTask(t, now), time: dayLabel(t.doneAt, now),
        doneWhen: `Done ${dayIndex(t.doneAt, now) === 0 ? "today" : dayLabel(t.doneAt, now)}, ${timeText(t.doneAt)}`,
      })),
      categories: data?.categories ?? [],
      week: weekOf(events, data?.tasks ?? [], now),
      places: [...new Set(events.filter((e) => !isOnline(e)).map(placeOf).filter(Boolean))],
      weather: forecast && now - forecast.fetched < WEATHER_GOOD_FOR ? Weather.line(forecast, now, Board.settings.units) : null,
      notice: noticeNow(),
      trains: !feedFailed
        ? { lines: strip }
        : { down: `Live trains unavailable.${feed ? ` Last update ${stamp(feed.stamp)}.` : ""}` },
      trainsUpdated: feed ? `Updated ${stamp(feed.stamp, true)}` : "Waiting for trains",
    };
  }

  // Trains get a real position every second from their predicted times.
  function placeTrains() {
    if (!feed || !onBoard) return;
    const now = Date.now() / 1000;
    [onBoard.pass, ...onBoard.schedule.map((r) => r.event)].forEach((event) => {
      event?.routes?.forEach((route) => route.legs.forEach((l) => {
        l.trains = MTA.trainsOn(l, feed.trips, now, l.mine);
      }));
    });
  }

  function show() {
    onBoard = liveState();
    placeTrains();
    Board.render(onBoard);
    Board.moveTrains();
  }

  const neededLines = () => [...new Set((data?.events ?? [])
    .flatMap((e) => waysTo(placeOf(e)).flatMap((way) => way.legs.map((l) => l.line))))];

  async function refreshTrains() {
    try {
      const lines = neededLines();
      if (lines.length) feed = await MTA.load(lines);
      feedFailed = false;
    } catch {
      feedFailed = true;
    }
  }

  // These change slowly, and the alerts feed is large, so they're fetched less often.
  let alertsAt = 0;
  async function refreshAlerts() {
    if (Date.now() - alertsAt < ALERTS_EVERY) return;
    try {
      await MTA.loadAlerts();
      alertsAt = Date.now();
    } catch {
      // The last copy stays, and it's asked for again next time.
    }
  }

  async function refreshWeather() {
    const home = Board.settings.places.Home?.[0]?.stop;
    const spot = MTA_NETWORK.stops[home];
    if (!spot || (forecast && Date.now() - forecast.fetched < WEATHER_EVERY)) return;
    try {
      forecast = await Weather.load(spot[1], spot[2]);
    } catch {
      // The line disappears once the last forecast is too old to trust.
    }
  }

  async function send(method, path, body) {
    let response;
    try {
      response = await fetch(path, {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Can't reach the board's server");
    }
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error);
    return reply;
  }

  // The version the page was loaded with. When the server's changes, from a restart or new
  // files, the page reloads to pick it up, once nothing is being typed.
  let loaded = null;
  function reloadIfUpdated(version) {
    if (!version) return;
    loaded ??= version;
    if (version !== loaded && !Board.busy()) location.reload();
  }

  function useBoard(next) {
    data = next;
    serverDown = false;
    reloadIfUpdated(next.version);
    if (data.settings) Board.loadSettings(data.settings);
    Board.loadStatus({ sources: data.sources, ai: data.ai, access: data.access, repeating: data.repeating ?? [] });
  }

  // A simulated scene can't show real data, so anything real that's saved there goes live.
  const leaveScene = () => location.replace(`${location.pathname}${location.hash}`);

  async function pull() {
    try {
      const response = await fetch("/api/board");
      if (response.status === 401) {
        askForCode();
        return;
      }
      if (!response.ok) throw new Error(response.status);
      useBoard(await response.json());
    } catch {
      serverDown = true;
    }
  }

  // The send panel says when the AI has changed something, so the board shows it straight away.
  addEventListener("message", async (e) => {
    if (e.origin !== location.origin || e.data !== "board-changed" || !live()) return;
    await pull();
    show();
  });

  // Another device has to enter the code from the board's menu before it can see anything.
  function askForCode() {
    const form = document.getElementById("pair");
    if (!form.hidden) return;
    form.hidden = false;
    document.getElementById("pair-code").focus();
  }
  document.getElementById("pair").onsubmit = async (e) => {
    e.preventDefault();
    const problem = document.getElementById("pair-problem");
    problem.textContent = "";
    try {
      await send("POST", "/api/pair", { code: document.getElementById("pair-code").value.trim() });
    } catch (error) {
      problem.textContent = error.message;
      return;
    }
    document.getElementById("pair").hidden = true;
    if (live()) await slowTick();
    else await pull();
  };

  // Settings used to live in the browser, so any left there move to the server once.
  async function moveOldSettings() {
    try {
      const old = localStorage.getItem("board-settings");
      if (!old) return;
      await send("PUT", "/api/settings", JSON.parse(old));
      localStorage.removeItem("board-settings");
    } catch {
      // It stays in the browser and is tried again next time.
    }
  }

  // Events come first, because they decide which lines' trains to fetch.
  async function slowTick() {
    await pull();
    show();
    await Promise.all([refreshTrains(), refreshAlerts(), refreshWeather()]);
    show();
  }

  function tick() {
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== lastMinute) {
      lastMinute = minute;
      show();
      return;
    }
    placeTrains();
    Board.moveTrains();
  }

  async function start() {
    stop();
    await moveOldSettings();
    timers = [setInterval(slowTick, 30000), setInterval(tick, 1000)];
    await slowTick();
  }

  function stop() {
    timers.forEach(clearInterval);
    timers = [];
  }

  const live = () => timers.length > 0;

  Board.onSettings((settings) => {
    if (!data) return;
    send("PUT", "/api/settings", settings).catch(() => {});
    if (live()) refreshTrains().then(show);
  });

  Board.onTask((id, done) => {
    if (!live()) return;
    send("POST", `/api/tasks/${encodeURIComponent(id)}/done`, { done }).then(pull).then(show).catch(() => {});
  });

  Board.onSkip((id, skip) => {
    if (!live()) return;
    send("POST", `/api/events/${encodeURIComponent(id)}/skip`, { skip }).then(pull).then(show).catch(() => {});
  });

  Board.onUnrepeat(async (id) => {
    await send("POST", `/api/repeating/${encodeURIComponent(id)}/remove`, {});
    await pull();
    show();
  });

  Board.onTaskInfo((id, info) => {
    if (!live()) return;
    send("PUT", `/api/tasks/${encodeURIComponent(id)}/info`, info).then(pull).then(show).catch(() => {});
  });

  Board.onCategories((list) => {
    if (!live()) return;
    send("PUT", "/api/categories", list).then(pull).then(show).catch(() => {});
  });

  Board.onAddTask(async (title, due, category) => {
    await send("POST", "/api/tasks", { title, due, category });
    if (!live()) {
      leaveScene();
      return;
    }
    await pull();
    show();
  });

  Board.onLink(async (kind, link) => {
    useBoard(await send("PUT", "/api/links", { [kind]: link }));
    if (!live()) {
      leaveScene();
      return;
    }
    await refreshTrains();
    show();
  });

  // The AI is slow, so a request becomes a row on the board and this checks back on it.
  Board.onAsk(async (text) => {
    Board.setJob({ label: "AI", busy: true, title: `Working on "${text.slice(0, 32)}"`, detail: "Can take 1 to 3 min" });
    try {
      const { job } = await send("POST", "/api/ask", { text });
      let result;
      do {
        await new Promise((resolve) => { setTimeout(resolve, 3000); });
        result = await (await fetch(`/api/ask/${job}`)).json();
      } while (result.status === "working");
      if (result.status !== "done") throw new Error(result.error);
      Board.setJob(result.answer
        ? { label: "Answer", title: result.answer }
        : { label: "Done", title: result.summary ?? `Added ${result.added} ${result.added === 1 ? "task" : "tasks"}` });
      await pull();
      show();
    } catch {
      Board.setJob({ label: "Failed", title: "The AI didn't respond. Nothing was added.", retry: true, text });
    }
  });

  // scenes.js takes over the start when it's on the page, but the menu still needs the real
  // settings and links in a simulated scene.
  addEventListener("DOMContentLoaded", () => {
    if (window.boardScenes) pull();
    else start();
  });

  return { start, stop };
})();
