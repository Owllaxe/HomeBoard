// The scene picker, for checking how the board looks in every state. Nothing depends on this
// file: remove it and its script tag and the board just runs live. Scenes other than "live"
// are simulated, and everything they do goes through Board.render(state).
(() => {
  window.boardScenes = true;
  const clock = (t) => `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, "0")}`;
  const at = (h, m) => h * 60 + m;

  // Each stretch of line runs in travel direction and starts a few stops before you board,
  // so the trains heading for you are on the map. `board` is the stop you get on at.
  // The ids are the MTA's own, so live trains line up with these stops.
  const paths = {
    F: { line: "F", dir: "S", board: 5, stops: ["D17", "D18", "D19", "D20", "D21", "F14", "F15", "F16", "F18", "A41"] },
    Fup: { line: "F", dir: "N", board: 3, stops: ["F18", "F16", "F15", "F14", "D21", "D20"] },
    R: { line: "R", dir: "S", board: 3, stops: ["R19", "R20", "R21", "R22", "R23", "R24", "R25", "R26", "R27", "R28", "R29"] },
    A: { line: "A", dir: "S", board: 1, stops: ["A31", "A32", "A33", "A34", "A36", "A38", "A40", "A41"] },
    six: { line: "6", dir: "S", board: 2, stops: ["635", "636", "637", "638", "639", "640"] },
    four: { line: "4", dir: "S", board: 1, stops: ["635", "640", "418", "419", "420", "423"] },
  };
  // Trains two minutes a stop apart in time, placed from when they reach your stop.
  const leg = (key, now, dep, mine) => {
    const path = paths[key];
    const trains = [-14, -7, 0, 7].map((offset) => {
      const base = path.board - (dep + offset - now) / 2;
      return { id: offset, base, at: base, you: mine && offset === 0 };
    });
    return { ...path, trains };
  };

  const toCampus = (dep, now, { late = 0, estimate = false, line = "F", station = "2 Av" } = {}) => {
    const live = estimate ? now + 3 : dep;
    const mine = !estimate;
    const lead = line === "A" ? "A" : "F";
    return [
      {
        id: lead.toLowerCase(), via: station, lines: [line], plan: "Direct",
        train: { line, time: clock(dep) }, leave: clock(dep - 5), arrive: clock(dep + 19 + late), leaveIn: dep - 5 - now,
        goNote: `${line} at ${clock(dep)}, 5 min walk to ${station}`,
        legs: [leg(lead, now, live, mine)],
      },
      {
        id: "r", via: "Prince St", lines: ["R"], plan: "Direct",
        train: { line: "R", time: clock(dep + 3) }, leave: clock(dep - 7), arrive: clock(dep + 23 + late), leaveIn: dep - 7 - now,
        goNote: `R at ${clock(dep + 3)}, 10 min walk to Prince St`,
        legs: [leg("R", now, live + 3, mine)],
      },
      {
        id: "six", via: "Bleecker St", lines: ["6", "4"], plan: "1 transfer",
        train: { line: "6", time: clock(dep + 5) }, leave: clock(dep - 3), arrive: clock(dep + 26 + late), leaveIn: dep - 3 - now,
        goNote: `6 at ${clock(dep + 5)}, 8 min walk to Bleecker St`,
        legs: [leg("six", now, live + 5, mine), leg("four", now, live + 14, false)],
      },
      ...(line === "F" ? [{
        id: "a", via: "W 4 St", lines: ["A"], plan: "Direct",
        train: { line: "A", time: clock(dep + 6) }, leave: clock(dep - 6), arrive: clock(dep + 24 + late), leaveIn: dep - 6 - now,
        goNote: `A at ${clock(dep + 6)}, 12 min walk to W 4 St`,
        legs: [leg("A", now, live + 6, mine)],
      }] : []),
    ].filter((route, i) => !i || route.leaveIn >= 0);
  };

  const toBobst = (now) => [
    {
      id: "walk", via: "Walk", lines: [], plan: "16 min on foot",
      walk: "16 min", leave: "5:10", arrive: "5:26", leaveIn: at(17, 10) - now,
      legs: [],
    },
    {
      id: "fup", via: "2 Av", lines: ["F"], plan: "Direct",
      train: { line: "F", time: "5:14" }, leave: "5:09", arrive: "5:24", leaveIn: at(17, 9) - now,
      goNote: "F at 5:14, 5 min walk to 2 Av",
      legs: [leg("Fup", now, at(17, 14), false)],
    },
  ];

  const mechanics = (now, dep = at(9, 3), options) => ({
    id: "mech", title: "Mechanics of Materials", starts: "9:30", place: "Science Center", homes: ["F14"], destStop: "A41",
    routes: toCampus(dep, now, options),
  });
  const calculus = (now) => ({
    id: "calc", title: "Calculus III", starts: "11:00", place: "Math Building", homes: ["F14"], destStop: "A41",
    estimate: true, note: "Exact train from 9:27",
    routes: toCampus(at(10, 32), now, { estimate: true }),
  });
  const fluids = (now) => ({
    id: "fluids", title: "Fluids lab", starts: "1:00", place: "Lab Annex", homes: ["F14"], destStop: "A41",
    change: "Room changed: Lab Annex",
    estimate: true, note: "Exact train from 11:20",
    routes: toCampus(at(12, 25), now, { estimate: true }),
  });
  const group = (now) => ({
    id: "group", title: "Study group", starts: "5:30", place: "Bobst Library", homes: ["F14"], destStop: "D20",
    routes: toBobst(now),
  });
  const review = (now, starts = "Sat 11:00") => ({
    id: "review", title: "Statics review", starts, place: "Science Center", homes: ["F14"], destStop: "A41",
    estimate: true, note: "Tomorrow. Exact train from 9:25",
    routes: toCampus(at(34, 30), now, { estimate: true }),
  });

  const schedule = (now, ...gone) => [
    { id: "calc", time: "11:00", title: "Calculus III", detail: "Math Building", event: calculus(now) },
    { id: "fluids", time: "1:00", title: "Fluids lab", detail: "Lab Annex", change: "Room changed: Lab Annex", event: fluids(now) },
    { id: "group", time: "5:30", title: "Study group", detail: "Leave about 5:10", event: group(now) },
  ].filter((r) => !gone.includes(r.id));

  // Deliberately out of order: the board ranks them by `due` itself.
  const tasks = [
    { id: "report", kind: "todo", due: "2026-11-02T09:00", time: "Mon", title: "Fluids lab report", detail: "9:00 am, Brightspace" },
    { id: "rao", kind: "todo", due: "2026-10-30T17:00", time: "Today", title: "Email Prof. Rao" },
    { id: "statics", kind: "todo", due: "2026-11-01T23:59", time: "Sun", title: "Statics HW 7", detail: "11:59 pm, WebAssign" },
    { id: "coned", kind: "todo", due: "2026-10-30T23:59", time: "Today", title: "Pay Con Ed bill" },
  ];

  const week = [
    { day: "Fri 30", items: [
      { time: "9:30", title: "Mechanics" }, { time: "11:00", title: "Calculus III" },
      { time: "1:00", title: "Fluids lab" }, { time: "5:30", title: "Study group" },
    ] },
    { day: "Sat 31", items: [{ time: "11:00", title: "Statics review" }] },
    { day: "Sun 1", items: [{ due: true, time: "11:59 pm", title: "Statics HW 7" }] },
    { day: "Mon 2", items: [
      { due: true, time: "9:00 am", title: "Fluids lab report" }, { time: "9:30", title: "Mechanics" },
    ] },
    { day: "Tue 3", items: [{ time: "11:00", title: "Calculus III" }] },
    { day: "Wed 4", items: [
      { time: "8:00", title: "Drawing Studio (ART 1100)" }, { time: "9:30", title: "Mechanics" },
      { time: "12:00", title: "Art History Survey (ART 2200)" }, { time: "1:00", title: "Fluids lab" },
      { time: "4:00", title: "Linear Algebra and Differential Equations (MATH 2030)" }, { time: "8:00", title: "Math Class" },
    ] },
    { day: "Thu 5", items: [] },
  ];

  const live = {
    lines: [
      { line: "F", towards: "Brooklyn", mins: [5, 12, 22] },
      { line: "F", towards: "Manhattan", mins: [3, 9, 17] },
    ],
  };
  const friday = "Friday October 30";
  // Train times as minutes past 8:00, so the bar always agrees with the pass
  const trainsAt = (minute, delayed) => ({
    lines: [
      { line: "F", towards: "Brooklyn", mins: [46, 53, 63, 71, 78].filter((t) => t !== delayed).map((t) => t - minute).filter((m) => m >= 0).slice(0, 3) },
      { line: "F", towards: "Manhattan", mins: [44, 50, 58, 66, 74].map((t) => t - minute).filter((m) => m >= 0).slice(0, 3) },
    ],
  });

  const day = (now, pass, trains, more = {}) => ({
    now: clock(now), date: friday, pass, schedule: schedule(now), tasks, week, trains,
    weather: "52°, rain around 4 pm, take an umbrella", ...more,
  });
  const morningAt = (now) => day(now, mechanics(now), trainsAt(now - 480));
  const nineEleven = (now) => ({
    ...mechanics(now, at(9, 11)), change: "Your 9:03 is delayed. Take the 9:11.",
  });

  const scenes = {
    live: { label: "Live trains" },
    morning: { label: "Morning", ...morningAt(at(8, 41)) },
    soon: { label: "Leave soon", ...morningAt(at(8, 55)) },
    soonA: {
      label: "Leave soon, A train",
      ...day(at(8, 55), mechanics(at(8, 55), at(9, 3), { line: "A", station: "W 4 St" }), trainsAt(55)),
    },
    leaveNow: { label: "Leave now", ...morningAt(at(8, 58)) },
    changed: { label: "Train changed", ...day(at(8, 49), nineEleven(at(8, 49)), trainsAt(49, 63)) },
    soonChanged: { label: "Train changed, leave soon", ...day(at(9, 2), nineEleven(at(9, 2)), trainsAt(62, 63)) },
    estimate: {
      label: "Later, estimate",
      ...day(at(11, 4), fluids(at(11, 4)), live, { schedule: schedule(at(11, 4), "calc", "fluids") }),
    },
    walking: {
      label: "Walking",
      ...day(at(16, 40), group(at(16, 40)), live, { schedule: schedule(at(16, 40), "calc", "fluids", "group") }),
    },
    walkSoon: {
      label: "Walking, leave soon",
      ...day(at(17, 7), group(at(17, 7)), live, { schedule: schedule(at(17, 7), "calc", "fluids", "group") }),
    },
    evening: {
      label: "Evening",
      ...day(at(21, 15), review(at(21, 15)), live, { schedule: [] }),
    },
    night: {
      label: "Night",
      ...day(at(25, 12), { ...review(at(25, 12), "11:00"), note: "Exact train from 9:25" }, live, {
        date: "Saturday October 31", night: true, schedule: [],
      }),
    },
    empty: {
      label: "Nothing coming up",
      ...day(at(21, 15), { id: "none", empty: true, title: "No events coming up", note: "Add one with Add or ask" }, live, {
        schedule: [], tasks: [], week: [],
      }),
    },
    down: {
      label: "Trains down",
      ...day(at(8, 41), {
        ...mechanics(at(8, 41), at(9, 3), { late: 3 }), estimate: true, note: "Usual schedule, no live trains",
      }, { down: "Live trains unavailable. Last update 8:29." }),
    },
  };

  const jobs = {
    answer: {
      label: "AI answer",
      job: { label: "Answer", title: "Your longest free stretch this weekend is Sunday afternoon. Statics HW 7 is due that night." },
    },
    failed: {
      label: "AI failed",
      job: { label: "Failed", title: "The AI didn't respond. Nothing was added.", retry: true, text: "Dynamics quiz 4, Thu 9:30 am" },
    },
  };

  let current = new URLSearchParams(location.search).get("scene") ?? "live";
  let timer;
  let onBoard = null;
  const put = (state) => {
    onBoard = state;
    Board.render(state);
  };
  const show = (name) => {
    clearInterval(timer);
    BoardApp.stop();
    current = name;
    Board.setJob(null);
    if (name === "live") {
      onBoard = null;
      BoardApp.start();
    } else {
      put(structuredClone(scenes[name]));
    }
    menu.querySelectorAll("button[data-scene]").forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.scene === name));
  };

  // Runs the morning at one minute per second, so the countdown can be seen
  function play() {
    show("morning");
    let now = at(8, 41);
    timer = setInterval(() => {
      now += 1;
      put(morningAt(now));
      if (now >= at(8, 58)) clearInterval(timer);
    }, 1000);
  }

  // In the simulated scenes, sped up so movement shows: one stop about every 20 seconds.
  const started = Date.now();
  setInterval(() => {
    if (!onBoard) return;
    const run = (Date.now() - started) / 20000;
    [onBoard.pass, ...onBoard.schedule.map((r) => r.event)].forEach((event) => {
      event?.routes?.forEach((route) => route.legs.forEach((l) => l.trains.forEach((t) => {
        if (t.you) {
          t.at = Math.min(l.board, t.base + run);
          return;
        }
        // Past the end of the stretch, the next train comes in from before the start.
        const last = l.stops.length - 1;
        const x = t.base + run;
        t.at = x <= last ? x : (x - last) % (last + 5) - 5;
      })));
    });
    Board.moveTrains();
  }, 1000);

  // Picker
  const style = document.createElement("style");
  style.textContent = `
    .demo{position:fixed;left:2.25rem;bottom:.3rem;z-index:5;font:500 .8125rem/1 var(--body)}
    .demo>button{background:none;border:0;color:var(--steel);padding:.45rem 0;font:inherit;text-decoration:underline;text-underline-offset:2px}
    .demo-menu{position:absolute;left:0;bottom:2rem;width:12rem;max-height:80dvh;overflow:auto;background:var(--slate-up);border:1px solid var(--hair);padding:.25rem;box-shadow:0 .5rem 1.5rem rgba(0,0,0,.5)}
    .night .demo>button{opacity:.3}
    .demo-menu[hidden]{display:none}
    .demo-menu button{display:block;width:100%;min-height:2.25rem;padding:0 .625rem;background:none;border:0;color:var(--text);text-align:left;font:inherit}
    .demo-menu button:hover{background:var(--hair)}
    .demo-menu button[aria-pressed=true]{font-weight:700;text-decoration:underline;text-underline-offset:2px}
    @media (max-width:860px),(max-height:560px),(orientation:portrait){.demo{position:static;display:block;padding:0 1rem 1rem}.demo-menu{position:static;width:auto;max-height:none;margin-top:.5rem}}
  `;
  document.head.append(style);

  const demo = document.createElement("nav");
  demo.className = "demo";
  demo.setAttribute("aria-label", "Simulated scenes");
  demo.innerHTML = `<button type="button" aria-expanded="false">Simulated data: scenes</button><div class="demo-menu" hidden></div>`;
  document.body.append(demo);
  const menu = demo.querySelector(".demo-menu");
  menu.innerHTML =
    Object.entries(scenes).map(([k, s]) => `<button type="button" data-scene="${k}">${s.label}</button>`).join("") +
    Object.entries(jobs).map(([k, j]) => `<button type="button" data-job="${k}">${j.label}</button>`).join("") +
    `<button type="button" data-play>Run the countdown</button><button type="button" data-wall>Touch mode</button>`;
  const toggle = demo.firstElementChild;
  toggle.onclick = () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", !menu.hidden);
  };
  menu.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.scene) show(b.dataset.scene);
    if (b.dataset.job) Board.setJob(jobs[b.dataset.job].job);
    if ("play" in b.dataset) play();
    if ("wall" in b.dataset) Board.setWall(!document.body.classList.contains("wall"));
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", false);
  };

  show(scenes[current] ? current : "live");
})();
