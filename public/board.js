// Renders the board from one state object. See scenes.js for its shape.
window.Board = (() => {
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lines = {
    "#EE352E": "123", "#00933C": "456", "#B933AD": "7", "#0039A6": "ACE",
    "#FF6319": "BDFM", "#6CBE45": "G", "#996633": "JZ", "#A7A9AC": "L",
    "#FCCC0A": "NQRW", "#808183": "S",
  };
  const lineColor = (line) =>
    Object.keys(lines).find((c) => lines[c].includes(line)) ?? "#808183";
  // Only these line colours are dark enough to carry light text across a whole stub.
  const lightText = "ACE7JZ";

  let state = null;
  let passId = null;
  let picked = null;
  let view = "home";
  const chosen = new Map();
  const noticed = new Set();
  const done = new Set();
  const elements = new Map();
  let toastTimer;
  let undo = null;
  let job = null;
  // The tasks page: the category showing (null for All, "" for Other), the task opened,
  // whether it's choosing a new category, and a task being held to drag.
  let tpCat = null;
  let tpOpen = null;
  let tpMoving = false;
  let held = null;
  // Showing recently done tasks instead of a category, and ones put back since the last update.
  let tpDone = false;
  const restored = new Set();

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const lineInk = (c) => (c === "#FCCC0A" ? "#14171A" : "#fff");
  // Drops a course code from the end of a name: "Statics (ENGR 2210)" is Statics.
  const shortName = (title) => title.replace(/\s*\([A-Z]{2,}(-[A-Z]+)?\s*\d+[A-Z]?\)$/, "");

  // The rubber edge: pulling past the end moves things less and less, up to a limit that
  // is never quite reached, so a drag there feels like it's getting heavier.
  function stretch(over) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Math.sign(over) * 5 * rem * (1 - Math.exp(-Math.abs(over) / (8 * rem)));
  }

  function bullet(line) {
    const c = lineColor(line);
    return `<span class="bullet" style="--c:${c};--fg:${lineInk(c)}" aria-label="${esc(line)} train">${esc(Routes.label(line))}</span>`;
  }

  function renderSegments(p) {
    const seg = (label, value, cls = "") =>
      `<div><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
    const place = seg("Place", esc(p.place));
    const route = p.walk
      ? seg("Walk", esc(p.walk))
      : p.train
        ? seg(p.estimate ? "Train, about" : "Train", `${bullet(p.train.line)}${esc(p.train.time)}`, p.estimate ? "approx" : "")
        : "";
    const approx = p.estimate ? "approx" : "";
    const arrive = p.online ? "" : seg(p.estimate ? "Arrive, about" : "Arrive", esc(p.arrive), approx);
    $("segments").innerHTML = seg("Starts", esc(p.starts)) + place + route + arrive;
    fitSegments();
  }

  // Long place names shrink only when they really don't fit.
  function fitSegments() {
    $("segments").querySelectorAll("dd").forEach((dd) => {
      dd.classList.remove("long");
      if (dd.scrollWidth > dd.clientWidth + 1) dd.classList.add("long");
    });
  }

  // A route's own times replace the event's, so picking a route updates the pass.
  const routeOf = (event) =>
    event.routes?.find((r) => r.id === chosen.get(event.id)) ?? event.routes?.[0];

  function withRoute(event) {
    const route = routeOf(event);
    if (!route) return event;
    const { id, legs, via, lines, plan, alertText, ...times } = route;
    return { ...event, train: undefined, walk: undefined, goNote: undefined, ...times };
  }

  // The pass shows the next event unless a row or a class in the week was picked. A picked
  // event is never white, so the white pass always means "this is the one you leave for next".
  const weekItem = () => state.week?.flatMap((d) => d.items).find((i) => i.event && i.id === picked);
  const pickedRow = () => state.schedule.find((r) => r.id === picked) ?? weekItem();
  const shownEvent = () => pickedRow()?.event ?? state.pass;

  function drawPass() {
    const isOther = !!pickedRow();
    $("pass").classList.toggle("is-other", isOther);
    $("pass").setAttribute("aria-label", isOther ? "Picked event" : "Next event");
    renderPass(withRoute(shownEvent()));
    fitWeather();
    fitMiniTitle();
  }

  // On the mini pass the name runs down the side. A long one shrinks a little to fit, and only
  // past that is it cut short.
  function fitMiniTitle() {
    const title = $("pass-title");
    title.style.fontSize = "";
    if (view !== "timeline") return;
    let size = parseFloat(getComputedStyle(title).fontSize);
    const smallest = size * 0.65;
    while (title.scrollHeight > title.clientHeight + 1 && size > smallest) {
      size -= 2;
      title.style.fontSize = `${size}px`;
    }
  }

  // The weather only takes spare room, so a full pass drops it instead of squeezing the times.
  function fitWeather() {
    const weather = $("pass-weather");
    weather.textContent = state.weather ?? "";
    weather.hidden = !state.weather || $("pass-gap").clientHeight < weather.scrollHeight + 8;
  }

  function slidePass() {
    if (calm) return;
    [...$("pass").querySelectorAll(".pass-title, .segments")].forEach((k) => k.animate(
      [{ transform: "translateX(1.5rem)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 460, delay: 120, fill: "backwards", easing: "cubic-bezier(.16,1,.3,1)" }));
  }

  // `from` is where it was picked. One picked in the week stays until you leave the week.
  let pickedFrom = "home";
  function pick(id, from = "home") {
    // The next event is already on the pass, white, so picking it just clears any other pick.
    picked = picked === id || id === state.pass?.id ? null : id;
    pickedFrom = from;
    armRevert();
    drawPass();
    slidePass();
    renderRows();
    renderWeek();
    renderTimeline();
  }

  // A picked event goes back to the next one 10 seconds after the last touch.
  const REVERT_MS = 10000;
  let revertTimer;
  let drain;
  function armRevert() {
    clearTimeout(revertTimer);
    drain?.cancel();
    if (!picked || pickedFrom === "week") return;
    revertTimer = setTimeout(() => {
      if (view === "map") setView("home");
      pick(picked);
    }, REVERT_MS);
    if (!calm) {
      drain = $("pass-timer").animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
        { duration: REVERT_MS, easing: "linear", fill: "forwards" });
    }
  }
  document.addEventListener("pointerdown", armRevert);
  document.addEventListener("keydown", armRevert);

  // The right side shows one view at a time. The pass never moves or changes size.
  function setView(next) {
    const was = view;
    // Leaving the week puts the next class back on the pass. Its map still counts as the week.
    if (picked && pickedFrom === "week" && next !== "week" && next !== "timeline" && next !== "map") {
      picked = null;
      drawPass();
      slidePass();
      renderRows();
      renderWeek();
    renderTimeline();
    }
    view = next;
    document.body.dataset.view = next;
    fitMiniTitle();
    const open = next === "map";
    $("pass-hit").setAttribute("aria-expanded", open);
    $("pass-hit").setAttribute("aria-label", open ? "Hide the route map" : "Show the route map");
    if (open) renderRoute();
    ask.hidden = true;
    $("setup").hidden = true;
    $("search").hidden = true;
    $("add").hidden = true;
    $("tp-entry").hidden = true;
    tpOpen = null;
    tpMoving = false;
    tpDone = false;
    if (next === "tasks") renderTasksPage();
    if (next === "week" && was !== "map") {
      if (was !== "timeline") weekShown = 0;
      requestAnimationFrame(() => { sizeRows(); scrollToWeek($("days")); nameWeek(); });
    }
    if (next === "timeline" && was !== "map") {
      requestAnimationFrame(() => { sizeRows(); scrollTimelineToMorning(); scrollToWeek($("timeline-body")); nameWeek(); });
    }
    armReturn();
  }

  // Typing holds the menu open. The stations side alone doesn't.
  const editingMenu = () => !ask.hidden || !$("search").hidden || !$("add").hidden || !$("tp-entry").hidden
    || document.activeElement?.id?.startsWith("link-");

  // On the wall, the week, menu and tasks go back to today by themselves, like a list page
  // does. On a laptop or phone they stay put while you read.
  const onWall = () => document.body.classList.contains("wall");
  let returnTimer;
  function armReturn() {
    clearTimeout(returnTimer);
    if (onWall() && (view === "week" || view === "timeline" || view === "menu" || view === "tasks")) {
      // Calendar links wait too, because getting a link means leaving for another tab.
      const waiting = () => editingMenu() || (editing === LINKS && !$("setup").hidden);
      returnTimer = setTimeout(() => { if (waiting()) armReturn(); else setView("home"); }, 30000);
    }
  }
  document.addEventListener("pointerdown", armReturn);
  // Esc closes the send panel, or goes back to today, unless something is being typed.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("send-drawer").hidden) closeSend();
    else if (view !== "home" && !editingMenu()) setView("home");
  });

  // The send page, beside the board on a laptop or phone. It loads the first time it's opened.
  function openSend() {
    const frame = $("send-frame");
    const focus = () => {
      frame.contentWindow?.focus();
      frame.contentDocument?.getElementById("text")?.focus();
    };
    const first = !frame.src;
    if (first) {
      frame.onload = focus;
      frame.src = "/send?embed";
    }
    $("send-drawer").hidden = false;
    if (!first) focus();
  }
  function closeSend() {
    $("send-drawer").hidden = true;
    $("send-open").focus();
  }
  $("send-open").onclick = openSend;
  $("send-close").onclick = closeSend;
  addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data === "send-close") closeSend();
  });
  $("week-open").onclick = () => setView("week");
  $("week-close").onclick = () => setView("home");
  $("menu-open").onclick = () => setView("menu");
  $("menu-close").onclick = () => setView("home");
  $("menu-reload").onclick = () => location.reload();
  $("tasks-open").onclick = () => setView("tasks");
  $("tp-close").onclick = () => setView("home");

  // What's connected, from the server: { sources, ai }. This is true in every scene.
  let status = {};
  // The server keeps these, so every screen shares them.
  // `places` maps a place name, or Home, to its nearby stations and the walk to each.
  const settings = { dim: "on", extra: "0", units: "f", places: {} };
  let onSettings = () => {};
  let onTask = () => {};
  let onAddTask = async () => {};
  let onLink = async () => {};
  let onSkip = () => {};
  const spotsText = (spots) =>
    (spots?.length ? spots.map((s) => `${BoardMap.name(s.stop)}, ${s.walk} min`).join("; ") : "Not set");
  const placesInUse = () => [...new Set((state.places ?? [])
    .concat([state.pass, ...state.schedule.map((r) => r.event)].filter((e) => e && !e.noLocation).map((e) => e.place).filter(Boolean))
    .concat(Object.keys(settings.places)))].filter((p) => p !== "Home");

  function drawSettings() {
    [["set-dim", "dim"], ["set-extra", "extra"], ["set-units", "units"]].forEach(([id, key]) => {
      [...$(id).children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.value === settings[key]));
    });
    $("menu-home").textContent = spotsText(settings.places.Home);
    $("menu-repeating").textContent = status.repeating?.length ? `${status.repeating.length}` : "None";
    if (state) {
      const unset = placesInUse().filter((p) => !settings.places[p]?.length).length;
      $("menu-places").textContent = unset ? `${unset} not set` : `${placesInUse().length} set`;
      const links = Object.values(status.sources ?? {});
      const on = links.filter((s) => s.connected).length;
      $("menu-links").textContent = links.some((s) => s.error) ? "Problem" : on ? `${on} of 2 connected` : "Not connected";
      $("menu-links").classList.toggle("is-unset", links.some((s) => s.error));
      $("ask-row").hidden = !status.ai?.available;
    }
  }
  function saveSettings() {
    drawnRoute = "";
    drawSettings();
    onSettings(settings);
  }
  function bindSetting(id, key) {
    $(id).onclick = (e) => {
      const value = e.target.dataset.value;
      if (!value) return;
      settings[key] = value;
      saveSettings();
    };
  }
  bindSetting("set-dim", "dim");
  bindSetting("set-extra", "extra");
  bindSetting("set-units", "units");

  // Home stations and places. Home is a place like any other, so one screen edits both.
  // `editing` is a place's name, or null for the list of places.
  let editing = null;
  const miniBullets = (lines) => `<span class="station-lines">${lines.map(bullet).join("")}</span>`;
  function openSetup(place) {
    editing = place;
    $("setup").hidden = false;
    renderSetup();
  }
  const LINKS = "Calendar links";
  const DEVICES = "Phone and laptop";
  // Repeating changes the AI made, like moving every Math Class to 7 pm. Each can be removed.
  const REPEATING = "Repeating changes";
  let onUnrepeat = async () => {};
  function renderRepeating() {
    $("setup-title").textContent = REPEATING;
    const rules = status.repeating ?? [];
    $("setup-rows").innerHTML = rules.map((r) => `<li class="menu-row"><span>${esc(r.text)}</span>
        <button type="button" class="head-link" data-unrepeat="${esc(r.id)}">Remove</button></li>`).join("")
      + `<li class="link-help link-note">${rules.length ? "These change every matching class from the day they were made, and never reach Google Calendar. Removing one puts the classes back at their calendar times." : "None yet. Ask the AI something like \"move every Wednesday Math Class to 7pm\" and it shows here."}</li>`;
  }
  function renderDevices() {
    const { access } = status;
    $("setup-title").textContent = DEVICES;
    $("setup-rows").innerHTML = access
      ? `<li class="link-row"><span class="link-help">On a phone or laptop on the same Wi-Fi, open this address for the whole board:</span>
          ${access.addresses.map((a) => `<span class="device-address">${esc(a)}</span>`).join("") || `<span class="menu-value is-unset">This board isn't on a network</span>`}
          <span class="link-help">Add /send to the end for a quick page to send assignments and schedule changes.</span></li>
         <li class="link-row"><span class="link-help">Enter this code there. You only need to once on each device.</span><span class="device-code">${esc(access.code)}</span></li>`
      : `<li class="link-row"><span class="link-help">This is only shown on the board itself.</span></li>`;
  }
  // What's been pasted stays until it saves, so a failed save or a refresh can't lose it.
  const drafts = { calendar: "", assignments: "" };
  const linkProblems = {};
  const linkRow = (kind, name, where) => {
    const s = status.sources?.[kind];
    const problem = linkProblems[kind] || s?.error;
    const line = problem ? `<span class="menu-value is-unset">${esc(problem)}</span>`
      : s?.connected ? `<span class="menu-value">Connected, ${s.count} ${kind === "calendar" ? "this week" : "items"}</span>`
        : `<span class="menu-value">Not connected</span>`;
    return `<li class="link-row">
      <span class="link-name"><span>${name}</span>${line}</span>
      <span class="link-help">${where}</span>
      <span class="link-form">
        <input class="search-text" id="link-${kind}" type="url" autocomplete="off" value="${esc(drafts[kind])}" placeholder="${s?.connected ? "Paste a new link to replace it" : "Paste the link"}">
        <button type="button" data-save="${kind}">Save</button>
        ${s?.connected ? `<button type="button" data-clear="${kind}">Remove</button>` : ""}
      </span>
    </li>`;
  };
  function renderLinks() {
    $("setup-title").textContent = LINKS;
    $("setup-rows").innerHTML =
      linkRow("calendar", "Google Calendar", "Calendar settings, your calendar, Integrate calendar, then Secret address in iCal format.") +
      linkRow("assignments", "Brightspace", "Calendar, the gear or Subscribe option, then copy the feed link.") +
      `<li class="link-help link-note">These links are private. They stay on this board and are never shown again. Pasting is easiest from a phone or laptop.</li>`;
  }
  function renderSetup() {
    const rows = $("setup-rows");
    if (editing === LINKS) {
      renderLinks();
      return;
    }
    if (editing === DEVICES) {
      renderDevices();
      return;
    }
    if (editing === REPEATING) {
      renderRepeating();
      return;
    }
    if (editing === null) {
      $("setup-title").textContent = "Places";
      rows.innerHTML = placesInUse().map((p) => `<li><button class="menu-row is-action" type="button" data-edit="${esc(p)}">
        <span>${esc(p)}</span><span class="menu-value${settings.places[p]?.length ? "" : " is-unset"}">${esc(spotsText(settings.places[p]))}</span>
      </button></li>`).join("");
      return;
    }
    const spots = (settings.places[editing] ??= []);
    $("setup-title").textContent = editing === "Home" ? "Home stations" : `Stations near ${editing}`;
    rows.innerHTML = spots.map((s, i) => `<li class="menu-row">
      <span class="station">${miniBullets(Routes.station(s.stop)?.lines ?? [])}<span>${esc(BoardMap.name(s.stop))}</span></span>
      <span class="stepper">
        <button type="button" data-less="${i}" aria-label="One minute less">-</button>
        <span>${s.walk} min walk</span>
        <button type="button" data-more="${i}" aria-label="One minute more">+</button>
        <button type="button" class="remove" data-remove="${i}">Remove</button>
      </span>
    </li>`).join("") +
      (spots.length < 4 ? `<li><button class="menu-row is-action" type="button" data-add="1">Add a station</button></li>` : "");
  }
  $("open-home").onclick = () => openSetup("Home");
  $("open-places").onclick = () => openSetup(null);
  $("open-links").onclick = () => openSetup(LINKS);
  $("open-devices").onclick = () => openSetup(DEVICES);
  $("open-repeating").onclick = () => openSetup(REPEATING);
  // A place's stations go back to the list of places, and the rest back to the menu.
  $("setup-close").onclick = () => {
    if (editing === null || editing === "Home" || editing === LINKS || editing === DEVICES || editing === REPEATING) $("setup").hidden = true;
    else openSetup(null);
  };

  async function saveLink(kind, link) {
    $("setup-title").textContent = "Checking the link";
    linkProblems[kind] = "";
    try {
      await onLink(kind, link);
      if (!status.sources?.[kind]?.error) drafts[kind] = "";
    } catch (error) {
      linkProblems[kind] = error.message;
    }
    if (editing === LINKS) renderLinks();
  }

  $("setup-rows").oninput = (e) => {
    const kind = e.target.id.match(/^link-(.+)$/)?.[1];
    if (kind) drafts[kind] = e.target.value;
  };

  $("setup-rows").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.unrepeat) {
      onUnrepeat(b.dataset.unrepeat).then(() => { if (editing === REPEATING) renderRepeating(); }).catch((error) => toast(error.message));
      return;
    }
    const { edit, add, less, more, remove, save, clear } = b.dataset;
    if (edit) { openSetup(edit); return; }
    if (save) {
      const link = $(`link-${save}`).value.trim();
      if (link) saveLink(save, link);
      return;
    }
    if (clear) { saveLink(clear, ""); return; }
    if (add) { openSearch(); return; }
    const spots = settings.places[editing];
    if (less) spots[less].walk = Math.max(1, spots[less].walk - 1);
    if (more) spots[more].walk = Math.min(60, spots[more].walk + 1);
    if (remove) spots.splice(remove, 1);
    saveSettings();
    renderSetup();
  };

  function openSearch() {
    $("search-text").value = "";
    $("search").hidden = false;
    renderResults();
    if (!document.body.classList.contains("wall")) $("search-text").focus();
  }
  function renderResults() {
    $("search-results").innerHTML = Routes.search($("search-text").value).slice(0, 4)
      .map((s) => `<li><button class="menu-row is-action" type="button" data-stop="${esc(s.stop)}">
        <span>${esc(s.name)}</span>${miniBullets(s.lines)}
      </button></li>`).join("");
  }
  // Adding a task by hand: a name and a day, from today to the end of the week, or no date.
  let addDue = null;
  function openAdd() {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 23, 59);
      return [i ? day.toLocaleDateString("en-US", { weekday: "short" }) : "Today", String(day.getTime())];
    });
    $("add-days").innerHTML = [...days, ["No date", ""]]
      .map(([name, value]) => `<button type="button" data-due="${value}">${name}</button>`).join("");
    addDue = days[0][1];
    drawAddDays();
    $("add-text").value = "";
    $("add").hidden = false;
    if (!document.body.classList.contains("wall")) $("add-text").focus();
  }
  function drawAddDays() {
    [...$("add-days").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.due === addDue));
  }
  $("add-open").onclick = openAdd;
  $("add-close").onclick = () => { $("add").hidden = true; };
  $("add-days").onclick = (e) => {
    if (e.target.dataset.due === undefined) return;
    addDue = e.target.dataset.due;
    drawAddDays();
  };
  $("add").onsubmit = async (e) => {
    e.preventDefault();
    const title = $("add-text").value.trim();
    if (!title) return;
    setView("home");
    try {
      await onAddTask(title, addDue ? Number(addDue) : null);
    } catch (error) {
      toast(error.message);
    }
  };

  $("search-text").oninput = renderResults;
  $("search-close").onclick = () => { $("search").hidden = true; };
  $("search").onsubmit = (e) => e.preventDefault();
  $("search-results").onclick = (e) => {
    const b = e.target.closest("[data-stop]");
    if (!b) return;
    settings.places[editing].push({ stop: b.dataset.stop, walk: 5 });
    $("search").hidden = true;
    saveSettings();
    renderSetup();
  };

  // A day is a row of blocks, in time order. Four fit across, and a busier day scrolls
  // sideways. A class can be tapped to show it on the pass.
  const block = (i) => {
    const inside = `<span class="block-time">${i.due ? "Due " : ""}${esc(i.time)}</span>
      <span class="block-title">${esc(shortName(i.title))}</span>`;
    if (!i.event) return `<span class="block${i.due ? " is-due" : ""}">${inside}</span>`;
    const on = i.id === picked || (!picked && i.id === state.pass.id);
    return `<button type="button" class="block is-class" data-id="${esc(i.id)}" aria-pressed="${on}">${inside}</button>`;
  };
  const dayBlocks = (items) => (items.length ? items.map(block).join("") : `<span class="day-free">Free</span>`);

  function renderWeek() {
    if (!state) return;
    // Redrawing keeps each day where it was scrolled to.
    const scrolled = [...$("days").querySelectorAll(".day-items")].map((row) => row.scrollLeft);
    $("days").innerHTML = state.week.map((d, i) => `<li class="day${i && i % 7 === 0 ? " is-week-start" : ""}">
      <span class="day-name">${esc(d.day)}</span>
      <span class="day-items scroll-x">${dayBlocks(d.items)}</span>
    </li>`).join("");
    $("days").querySelectorAll(".day-items").forEach((row, i) => { row.scrollLeft = scrolled[i] ?? 0; });
    sizeRows();
  }

  // Both week views show seven days to a screen and scroll down through five weeks. The
  // heading names the week at the top: this week, next week, then the week's first date.
  let weekShown = 0;
  function sizeRows() {
    const days = $("days");
    if (days.clientHeight) days.style.setProperty("--row", `${days.clientHeight / 7}px`);
    const body = $("timeline-body");
    const lanes = body.clientHeight - $("hours").offsetHeight;
    if (lanes > 0) $("lanes").style.setProperty("--row", `${lanes / 7}px`);
  }
  const rowOf = (scroller) => parseFloat(getComputedStyle(scroller === $("days") ? scroller : $("lanes")).getPropertyValue("--row")) || 1;
  function weekName(k) {
    if (k === 0) return "This week";
    if (k === 1) return "Next week";
    const first = state?.week[k * 7]?.start;
    return first ? `Week of ${new Date(first).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Later";
  }
  function nameWeek() {
    $("week-title").textContent = weekName(weekShown);
    $("timeline-title").textContent = `${weekName(weekShown)} by time`;
  }
  function showWeek(scroller) {
    weekShown = Math.max(0, Math.floor((scroller.scrollTop + rowOf(scroller) / 2) / rowOf(scroller) / 7));
    nameWeek();
  }
  // Moving between the two views keeps the same week in sight.
  function scrollToWeek(scroller) {
    scroller.scrollTop = weekShown * 7 * rowOf(scroller);
  }
  $("days").addEventListener("scroll", () => showWeek($("days")), { passive: true });
  $("timeline-body").addEventListener("scroll", () => showWeek($("timeline-body")), { passive: true });
  // The next class is already on the pass, so tapping it just clears any other pick.
  function pickFromWeek(e) {
    const id = e.target.closest("[data-id]")?.dataset.id;
    if (!id) return;
    if (id === state.pass.id) {
      if (picked) pick(picked, "week");
      return;
    }
    pick(id, "week");
  }
  $("days").onclick = pickFromWeek;
  $("lanes").onclick = pickFromWeek;

  // The week by time: each day a row across the same hours, each event placed at its start
  // and as wide as it lasts. Events that overlap share the row, one above the other. Each
  // hour keeps a readable width, so a long day scrolls sideways, starting at the morning.
  const HOUR_MS = 3600000;
  const HOUR_REM = 4.5;
  let morning = 8;
  let timelineFirst = 0;
  const hourName = (h) => (h % 12 || 12) + (h % 24 < 12 ? " am" : " pm");
  function renderTimeline() {
    if (!state) return;
    const timed = (d) => d.items.filter((i) => !i.due && !i.allDay && i.end);
    const hours = state.week.flatMap((d) => timed(d).map((i) => [(i.at - d.start) / HOUR_MS, (i.end - d.start) / HOUR_MS]));
    // At least 8 am to 6 pm, stretched to fit the earliest start and latest end.
    const first = Math.max(0, Math.min(8, ...hours.map(([s]) => Math.floor(s))));
    const last = Math.min(24, Math.max(18, ...hours.map(([, e]) => Math.ceil(e))));
    const span = last - first;
    const at = (h) => `${(((h - first) / span) * 100).toFixed(2)}%`;
    const marks = [];
    for (let h = first; h <= last; h += 1) marks.push(h);
    $("timeline-inner").style.width = `max(100%, ${6.5 + span * HOUR_REM}rem)`;
    const starts = hours.map(([s]) => s).filter((s) => s >= 6);
    morning = starts.length ? Math.floor(Math.min(...starts)) : 8;
    timelineFirst = first;
    $("hours").innerHTML = `<span class="hours-track">${marks.map((h) => `<span style="left:${at(h)}">${hourName(h)}</span>`).join("")}</span>`;
    const ticks = marks.map((h) => `<i class="tick" style="left:${at(h)}"></i>`).join("");
    const now = Date.now();
    $("lanes").innerHTML = state.week.map((d, index) => {
      // Events that overlap form a group, and only that group splits the row's height between
      // them. Within a group, each event takes the first lane that's free by its start.
      const placed = [];
      let group = null;
      [...timed(d)].sort((a, b) => a.at - b.at).forEach((i) => {
        if (!group || i.at >= group.end) group = { end: i.end, ends: [] };
        group.end = Math.max(group.end, i.end);
        let lane = group.ends.findIndex((end) => end <= i.at);
        if (lane < 0) lane = group.ends.push(0) - 1;
        group.ends[lane] = i.end;
        placed.push({ i, lane, group });
      });
      const slots = placed.map(({ i, lane, group: { ends } }) => {
        const lanes = ends.length;
        const start = Math.max(first, (i.at - d.start) / HOUR_MS);
        const end = Math.min(last, (i.end - d.start) / HOUR_MS);
        const on = i.id === picked || (!picked && i.id === state.pass.id);
        return `<button type="button" class="slot${i.end < now ? " is-past" : ""}" data-id="${esc(i.id)}" aria-pressed="${on}"
          style="left:${at(start)};width:${(((end - start) / span) * 100).toFixed(2)}%;top:${(lane / lanes) * 100}%;height:${100 / lanes}%">
          <span class="slot-time">${esc(i.time)}</span><span class="slot-title">${esc(shortName(i.title))}</span></button>`;
      }).join("");
      const nowHour = (now - d.start) / HOUR_MS;
      const nowLine = nowHour >= first && nowHour <= last && nowHour < 24 ? `<i class="now-line" style="left:${at(nowHour)}"></i>` : "";
      const allDay = d.items.filter((i) => i.allDay).map((i) => shortName(i.title)).join(", ");
      return `<li class="lane${index && index % 7 === 0 ? " is-week-start" : ""}"><span class="day-name">${esc(d.day)}${allDay ? `<span class="lane-all-day">${esc(allDay)}</span>` : ""}</span>
        <span class="lane-track">${ticks}${nowLine}${slots}</span></li>`;
    }).join("");
    sizeRows();
  }
  function scrollTimelineToMorning() {
    const body = $("timeline-body");
    body.scrollLeft = Math.max(0, (morning - timelineFirst) * HOUR_REM * rem() - rem());
  }
  $("timeline-open").onclick = () => setView("timeline");
  $("timeline-close").onclick = () => setView("week");
  $("timeline-today").onclick = () => setView("home");

  // The map goes back to wherever it was opened from: today, or the week.
  let mapFrom = "home";
  function openMap() {
    mapFrom = view === "week" || view === "timeline" ? view : "home";
    document.body.dataset.from = mapFrom;
    $("route-close").textContent = { week: "Back to week", timeline: "Back to week by time" }[mapFrom] ?? "Back to list";
    setView("map");
  }

  $("pass-hit").onclick = () => {
    // While the menu is open the pass sits at the right, and tapping it goes back.
    if (view === "menu") {
      setView("home");
      return;
    }
    const event = shownEvent();
    if (event.needsLinks) {
      setView("menu");
      openSetup(LINKS);
      return;
    }
    if (event.empty || event.noLocation) return;
    if (!routeOf(event)) {
      // No way to work out a route yet, so go straight to what's missing.
      setView("menu");
      if (settings.places.Home?.length) openSetup(event.place);
      else openSetup("Home");
      return;
    }
    if (view === "map") setView(mapFrom);
    else openMap();
  };
  $("route-close").onclick = () => setView(mapFrom);

  // Skipping takes one occurrence off the board, and Undo puts it straight back.
  $("pass-skip").onclick = () => {
    const { id, title } = shownEvent();
    if (picked) pick(picked);
    setView("home");
    onSkip(id, true);
    toast(`Skipped: ${title}`, () => onSkip(id, false));
  };

  function routeStatus(route) {
    if (state.trains.down) return state.trains.down;
    if (route.alertText) return route.alertText;
    if (!route.legs.length) return `No train needed. About ${route.walk} on foot.`;
    const leg = route.legs[0];
    const you = leg.trains.find((t) => t.you);
    if (!you) return `Showing ${leg.line} trains running now. Your exact train shows nearer the time.`;
    const stop = BoardMap.name(leg.stops[leg.board]);
    const time = route.train.time;
    if (you.at < 0) return `Your ${time} hasn't reached ${BoardMap.name(leg.stops[0])} yet.`;
    const away = Math.ceil(leg.board - you.at);
    if (away <= 0) return `Your ${time} is at ${stop}.`;
    return `Your ${time} is ${away} ${away === 1 ? "stop" : "stops"} from ${stop}.`;
  }

  function optionHTML(r, on, estimate) {
    const about = estimate ? "about " : "";
    return `<button class="option" type="button" data-route="${esc(r.id)}" aria-pressed="${on}">
      <span class="option-name">${r.lines.map(bullet).join("")}<span>${esc(r.via)}</span></span>
      <span class="option-times"><span>Leave ${about}${esc(r.leave)}</span><span>Arrive ${about}${esc(r.arrive)}</span></span>
      <span class="option-plan">${esc(r.plan)}${r.change ? `<span class="option-alert">${esc(r.change.split(" on the ")[0])}</span>` : ""}</span>
    </button>`;
  }

  function drawMap(event, route) {
    const trip = { homes: event.homes, dest: event.destStop, place: event.place };
    BoardMap.draw($("map"), event.routes, route, trip, lineColor, lineInk);
  }

  let drawnRoute = "";
  function renderRoute() {
    const event = shownEvent();
    const route = routeOf(event);
    if (!route) return;
    $("route-title").textContent = `To ${event.place}`;
    $("options").innerHTML = event.routes
      .map((r) => `<li>${optionHTML(r, r === route, event.estimate)}</li>`).join("");
    const down = !!state.trains.down;
    $("route-status").textContent = routeStatus(route);
    $("route-status").classList.toggle("down", down || !!route.alertText);
    $("map").classList.toggle("no-trains", down);
    const key = `${event.id}/${route.id}`;
    if (key !== drawnRoute || !BoardMap.move($("map"), route)) {
      drawMap(event, route);
      drawnRoute = key;
    }
  }

  function pickRoute(id) {
    chosen.set(shownEvent().id, id);
    drawPass();
    renderRoute();
  }

  // The board drives this row itself, because a browser's own scrolling can't stretch at
  // the ends. A finger or mouse drags it, it coasts on release, and a drag never picks.
  const row = $("options");
  let rowDrag = null;
  let coasting = 0;
  let dragged = false;
  const rowEnd = () => row.scrollWidth - row.clientWidth;
  const setOver = (px) => row.style.setProperty("--over", `${px}px`);

  function placeRow(left) {
    row.scrollLeft = Math.min(rowEnd(), Math.max(0, left));
    const over = left < 0 ? left : Math.max(0, left - rowEnd());
    setOver(-stretch(over));
  }

  function coast(speed) {
    let last = performance.now();
    let left = row.scrollLeft;
    const step = (now) => {
      left += speed * (now - last);
      speed *= .95 ** ((now - last) / 16);
      last = now;
      if (left < 0 || left > rowEnd()) {
        // Arriving fast still gives the end a little push, which then springs back.
        setOver(-stretch(speed * 80));
        coasting = requestAnimationFrame(() => { row.classList.remove("dragging"); setOver(0); });
        row.scrollLeft = left < 0 ? 0 : rowEnd();
        return;
      }
      row.scrollLeft = left;
      if (Math.abs(speed) > .02) coasting = requestAnimationFrame(step);
    };
    coasting = requestAnimationFrame(step);
  }

  row.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(coasting);
    dragged = false;
    rowDrag = { x: e.clientX, left: row.scrollLeft, moved: false, id: e.pointerId, speed: 0, at: e.timeStamp, lastX: e.clientX };
  });
  row.addEventListener("pointermove", (e) => {
    if (!rowDrag || e.pointerId !== rowDrag.id) return;
    const dx = e.clientX - rowDrag.x;
    if (!rowDrag.moved && Math.abs(dx) < 6) return;
    if (!rowDrag.moved) {
      row.setPointerCapture(rowDrag.id);
      row.classList.add("dragging");
    }
    rowDrag.moved = true;
    dragged = true;
    const gap = Math.max(1, e.timeStamp - rowDrag.at);
    rowDrag.speed = (rowDrag.lastX - e.clientX) / gap;
    rowDrag.at = e.timeStamp;
    rowDrag.lastX = e.clientX;
    placeRow(rowDrag.left - dx);
  });
  function endRowDrag() {
    if (!rowDrag) return;
    const { moved, speed } = rowDrag;
    const stretched = row.style.getPropertyValue("--over") !== "" && parseFloat(row.style.getPropertyValue("--over")) !== 0;
    rowDrag = null;
    if (!moved) return;
    if (stretched) {
      row.classList.remove("dragging");
      setOver(0);
    } else {
      coast(speed);
    }
  }
  row.addEventListener("pointerup", endRowDrag);
  row.addEventListener("pointercancel", endRowDrag);
  row.onclick = (e) => {
    const option = e.target.closest(".option");
    if (option && !dragged) pickRoute(option.dataset.route);
  };
  $("map").addEventListener("click", (e) => {
    const route = e.target.closest("[data-route]");
    if (route) pickRoute(route.dataset.route);
  });

  // Positions change far more often than anything else, so they skip the full render.
  function moveTrains() {
    if (view !== "map" || !state) return;
    const event = shownEvent();
    const route = routeOf(event);
    if (!route) return;
    if (!BoardMap.move($("map"), route)) drawMap(event, route);
    $("route-status").textContent = routeStatus(route);
  }

  function renderPass(p) {
    const stub = $("stub");
    $("pass-title").textContent = p.title;
    const empty = !!p.empty;
    $("segments").hidden = empty;
    if (!empty) renderSegments(p);

    const left = p.leaveIn ?? 0;
    const soon = !empty && !p.estimate && left <= 5;
    const line = p.train && lineColor(p.train.line);
    stub.className = `stub${soon ? " soon" : ""}${p.estimate ? " approx" : ""}`;
    stub.style.setProperty("--line", line ?? "#50585F");
    stub.style.setProperty("--line-ink", !line || lightText.includes(p.train.line) ? "#F4F5F6" : "#14171A");

    const tear = $("tear");
    tear.className = `tear${p.estimate || empty ? " loose" : ""}`;
    if (!tear.children.length) tear.innerHTML = "<i></i>".repeat(30);
    [...tear.children].forEach((notch, i) => notch.classList.toggle("on", i < left));

    const time = $("stub-time");
    const leaveNow = !empty && !p.estimate && !p.online && left <= 0;
    time.classList.toggle("words", leaveNow);
    if (empty) {
      $("stub-label").textContent = "";
      time.textContent = "";
      $("stub-sub").textContent = p.note;
    } else {
      $("stub-label").textContent = leaveNow ? "" : p.online ? "Starts" : p.estimate ? "Leave home, about" : "Leave home";
      time.textContent = leaveNow ? "Leave now" : p.leave;
      $("stub-sub").textContent = leaveNow
        ? p.goNote
        : p.note ?? (left === 1 ? "in 1 min" : `in ${left} min`);
    }

    $("pass-skip").hidden = !p.skippable;

    const change = $("stub-change");
    // A row keeps its change when it lifts onto the pass: one key for both, so it stays lit until tapped.
    const key = p.id + p.change;
    const showChange = p.change && !noticed.has(key);
    change.hidden = !showChange;
    if (showChange) {
      change.innerHTML = `<span>${esc(p.change)}</span><span class="cue">Got it</span>`;
      change.setAttribute("aria-label", `${p.change}. Tap to dismiss.`);
      change.onclick = () => { noticed.add(key); drawPass(); renderRows(); };
    }
  }

  function rowHTML(r) {
    if (r.kind === "note" || r.kind === "head") return `<span class="row-title">${esc(r.title)}</span>`;
    if (r.kind === "job") {
      const actions = `<span class="job-actions">${r.retry ? `<button class="retry" type="button">Try again</button>` : ""}<button class="dismiss" type="button">Dismiss</button></span>`;
      return `<span class="row-time">${esc(r.label)}</span>
        <span class="row-title">${esc(r.title)}</span>
        ${r.busy ? `<span class="row-detail">${esc(r.detail)}</span>` : actions}`;
    }
    const changed = r.change && !noticed.has(r.id + r.change);
    const detail = changed ? r.change : r.detail;
    const check = r.kind === "todo"
      ? `<input type="checkbox" aria-label="Mark ${esc(r.title)} done" ${done.has(r.id) ? "checked" : ""}>` : "";
    return `<span class="row-time">${esc(r.time)}</span>
      <span class="row-title">${esc(r.title)}</span>
      <span class="row-detail">${esc(detail ?? "")}</span>${check}`;
  }

  function makeRow(r) {
    const li = document.createElement("li");
    li.dataset.id = r.id;
    return li;
  }

  function fillRow(li, r) {
    const changed = r.change && !noticed.has(r.id + r.change);
    const wasChanged = li.classList.contains("is-changed");
    const tag = r.kind === "todo" ? "label" : r.event ? "button" : "div";
    const inner = li.firstElementChild;
    const row = inner?.tagName.toLowerCase() === tag ? inner : document.createElement(tag);
    if (row !== inner) {
      li.replaceChildren(row);
      if (tag === "button") row.type = "button";
    }
    // A category's color shows as a small tab at the front of the task.
    const tagColor = r.kind === "todo" ? colorOf(r.category) : "";
    row.style.setProperty("--tag", tagColor);
    row.className = "row" +
      (r.kind === "todo" ? " is-todo" : "") +
      (r.kind === "note" || r.kind === "head" ? ` is-${r.kind}` : "") +
      (tagColor ? " has-tag" : "") +
      (r.kind === "job" ? ` is-job${r.busy ? " is-busy" : ""}` : "") +
      (changed ? " is-changed" : "") +
      (r.id === picked ? " is-picked" : "") +
      (done.has(r.id) ? " is-done" : "");
    row.innerHTML = rowHTML(r);
    li.classList.toggle("is-changed", !!changed);
    if (changed && !wasChanged && !calm) row.classList.add("flash");
    if (r.event) {
      row.setAttribute("aria-pressed", r.id === picked);
      row.onclick = () => pick(r.id);
    }
    const dismiss = row.querySelector(".dismiss");
    if (dismiss) dismiss.onclick = () => { job = null; renderRows(); };
    const retry = row.querySelector(".retry");
    if (retry) retry.onclick = () => {
      input.value = job.text;
      setView("menu");
      ask.hidden = false;
      job = null;
      renderRows();
    };
    const box = row.querySelector("input");
    if (box) box.onchange = () => finishTodo(r, box.checked);
  }

  // Rows keep their identity, so a rerank slides them instead of redrawing the list.
  function renderRows(fromPass) {
    const before = new Map();
    elements.forEach((el, id) => before.set(id, el.getBoundingClientRect()));

    const left = (rows) => rows.filter((r) => !removed.has(r.id));
    const scheduled = left(state.schedule);
    // Earliest due first. An AI request sits on top so its progress can be seen.
    const dueRows = (job ? [{ id: "job", kind: "job", ...job }] : [])
      .concat(left(state.tasks).sort((a, b) => a.due.localeCompare(b.due)));
    const ids = new Set([...scheduled, ...dueRows].map((r) => r.id));

    elements.forEach((el, id) => {
      if (ids.has(id)) return;
      if (id === fromPass && !calm) {
        const box = el.getBoundingClientRect();
        const ghost = el.firstElementChild.cloneNode(true);
        Object.assign(ghost.style, {
          position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, zIndex: 3,
        });
        document.body.append(ghost);
        const shift = $("pass").getBoundingClientRect().right - box.left;
        ghost.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${shift}px)`, opacity: 0 }],
          { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => ghost.remove();
      }
      el.remove();
      elements.delete(id);
    });

    const place = (list, rows) => rows.forEach((r, i) => {
      let el = elements.get(r.id);
      if (!el) { el = makeRow(r); elements.set(r.id, el); }
      fillRow(el, r);
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
    });
    place($("schedule"), scheduled);
    place($("tasks"), dueRows);

    fitLists();
    if (view === "tasks" && !held) renderTasksPage();

    if (calm || !before.size) return;
    elements.forEach((el, id) => {
      const old = before.get(id);
      const now = el.getBoundingClientRect();
      if (el.hidden) return;
      if (!old || !old.height) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
      } else if (old.top !== now.top) {
        el.animate([{ transform: `translateY(${old.top - now.top}px)` }, { transform: "none" }],
          { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    });
  }

  const removed = new Set();

  // Lists scroll, and a faded edge says there's more. A change scrolled out of sight still
  // shows, as a button that brings it into view. On the wall, a list goes back to the top
  // by itself after a while.
  const LISTS = ["schedule", "tasks", "tp-rows"];
  const backToTop = {};
  LISTS.forEach((id) => {
    const list = $(id);
    list.addEventListener("scroll", () => {
      fitList(id);
      clearTimeout(backToTop[id]);
      if (onWall()) backToTop[id] = setTimeout(() => list.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" }), 30000);
    }, { passive: true });
    $(`${id}-more`).onclick = () => {
      const below = [...list.children].find((el) => el.classList.contains("is-changed") && el.offsetTop >= list.scrollTop + list.clientHeight);
      below?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    };
  });

  function fitLists() {
    LISTS.forEach(fitList);
  }

  function fitList(id) {
    const list = $(id);
    const more = $(`${id}-more`);
    list.classList.toggle("has-less", list.scrollTop > 1);
    list.classList.toggle("has-more", list.scrollTop + list.clientHeight < list.scrollHeight - 1);
    const below = [...list.children].filter((el) => el.classList.contains("is-changed")
      && el.offsetTop >= list.scrollTop + list.clientHeight).length;
    more.hidden = !below;
    more.classList.add("has-change");
    more.textContent = `${below} changed below`;
  }

  function finishTodo(r, checked) {
    if (!checked) return;
    done.add(r.id);
    restored.delete(r.id);
    renderRows();
    onTask(r.id, true);
    toast(`Done: ${r.title}`, () => { done.delete(r.id); removed.delete(r.id); renderRows(); onTask(r.id, false); });
    setTimeout(() => { if (done.has(r.id)) { removed.add(r.id); renderRows(); } }, 1400);
  }

  // The tasks page covers the home screen, so it has its own toast.
  function toast(text, onUndo) {
    const box = $(view === "tasks" ? "tp-toast" : "toast");
    $("toast").hidden = true;
    $("tp-toast").hidden = true;
    box.querySelector(".toast-text").textContent = text;
    box.hidden = false;
    box.querySelector(".toast-undo").hidden = !onUndo;
    undo = onUndo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 6000);
  }

  function renderTrains(t) {
    const box = $("trains");
    box.classList.toggle("down", !!t.down);
    box.innerHTML = t.down
      ? esc(t.down)
      : t.lines.map((l) =>
          `<span class="train">${bullet(l.line)}${esc(l.towards)}<b>${l.mins.join(" ")}</b> min</span>`).join("");
  }

  function render(next) {
    const changedPass = passId !== null && next.pass.id !== passId;
    state = next;
    // Once the server has a put-back task on the list again, it needn't be held out of Done.
    restored.forEach((id) => { if (next.allTasks?.some((t) => t.id === id)) restored.delete(id); });
    keepColors();
    if (picked && !pickedRow()) picked = null;
    $("board-date").textContent = next.date;
    $("board-clock").textContent = next.now;
    renderTrains(next.trains);
    drawPass();
    renderRows(changedPass ? next.pass.id : null);
    renderWeek();
    renderTimeline();
    if (changedPass) slidePass();
    passId = next.pass.id;
    if (view === "map") {
      if (routeOf(shownEvent())) renderRoute();
      else setView(mapFrom);
    }
    $("board-notice").textContent = next.notice ?? "";
    $("board-notice").hidden = !next.notice;
    $("menu-trains").textContent = next.trains.down ? "Unavailable" : next.trainsUpdated ?? "Simulated";
    drawSettings();
    if (!$("setup").hidden && !document.activeElement?.id?.startsWith("link-")) renderSetup();
    // Only the wall dims at night. A laptop or phone has its own brightness.
    const dim = !!next.night && !woken && settings.dim === "on" && onWall();
    document.body.classList.toggle("night", dim);
    if (dim && view !== "home") setView("home");
    fitLists();
  }

  // Tap to wake at night
  let woken = false;
  let wakeTap = false;
  document.addEventListener("pointerdown", () => {
    if (!document.body.classList.contains("night") || woken) return;
    woken = true;
    wakeTap = true;
    document.body.classList.remove("night");
    fitLists();
    setTimeout(() => { wakeTap = false; }, 700);
    setTimeout(() => {
      woken = false;
      if (state?.night && settings.dim === "on" && onWall()) {
        document.body.classList.add("night");
        setView("home");
      }
      fitLists();
    }, 20000);
  });
  // The tap that wakes the screen only wakes it: it can't tick a task or clear a change.
  document.addEventListener("click", (e) => {
    if (!wakeTap) return;
    wakeTap = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Add or ask
  const ask = $("ask");
  const input = $("ask-text");
  let onAsk = () => {};
  $("ask-open").onclick = () => {
    ask.hidden = false;
    if (!document.body.classList.contains("wall")) input.focus();
  };
  $("ask-cancel").onclick = () => { ask.hidden = true; };
  ask.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    ask.hidden = true;
    input.value = "";
    setView("home");
    onAsk(text);
  };
  document.querySelectorAll(".toast-undo").forEach((button) => {
    button.onclick = () => {
      button.closest(".toast").hidden = true;
      undo?.();
    };
  });

  // From home, swipe left for the week and right for the menu; the opposite swipe comes back.
  // Swiping up pushes the whole screen up for the tasks page. The panels follow the finger,
  // and capturing the pointer means a swipe can't also tap the row it started on.
  const stage = $("stage");
  const sliding = [$("board"), $("week"), $("app"), $("menu"), $("tasks-page"), $("timeline")];
  // On a phone the page scrolls, so up and down are left to the browser.
  const stacked = () => getComputedStyle(stage).position === "static";
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  function moveLift(dy) {
    const height = innerHeight;
    const pulled = view === "home" ? dy : dy - height;
    const shift = pulled > 0 ? stretch(pulled) : pulled < -height ? -height + stretch(pulled + height) : pulled;
    $("app").style.transform = `translateY(${shift}px)`;
    $("tasks-page").style.transform = `translateY(${shift + height}px)`;
  }
  const canLift = (dy) => !stacked() && ((view === "home" && dy < 0) || (view === "tasks" && dy > 0));
  let drag = null;
  function moveDrag(dx) {
    const [board, week, app, menu] = sliding;
    if (view === "menu" || (view === "home" && dx > 0)) {
      const open = menu.offsetWidth;
      const pulled = view === "menu" ? open + dx : dx;
      const shift = pulled <= open ? pulled : open + stretch(pulled - open);
      app.style.transform = `translateX(${shift}px)`;
      menu.style.transform = `translateX(${shift - open}px)`;
      return;
    }
    // Past the first or last page, the edge only stretches.
    const width = stage.clientWidth;
    const pages = [board, week, $("timeline")];
    const furthest = (pages.length - 1) * width;
    let at = { home: 0, week: 1, timeline: 2 }[view] * width - dx;
    if (at < 0) at = stretch(at);
    else if (at > furthest) at = furthest + stretch(at - furthest);
    pages.forEach((page, i) => { page.style.transform = `translateX(${i * width - at}px)`; });
  }
  // Pulling the far way only stretches the edge. It doesn't go anywhere.
  const leads = (dx) => view === "home" || view === "week" || (view === "timeline" ? dx > 0 : dx < 0);
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.scroll) {
      const { el, axis, speed, at } = drag.scroll;
      drag = null;
      // Only a finger still moving when it lifts sends the list gliding.
      if (e.type === "pointerup" && e.timeStamp - at < 80) glide(el, axis, speed);
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const up = e.type === "pointerup" && drag.on;
    const swiped = up && !drag.lift && leads(dx) && Math.abs(dx) > stage.clientWidth * .2;
    const lifted = up && drag.lift && canLift(dy) && Math.abs(dy) > stage.clientHeight * .15;
    drag = null;
    document.body.classList.remove("dragging");
    sliding.forEach((el) => { el.style.transform = ""; });
    if (swiped) {
      const next = { home: dx < 0 ? "week" : "menu", week: dx < 0 ? "timeline" : "home", timeline: "week" }[view] ?? "home";
      setView(next);
    }
    if (lifted) setView(view === "home" ? "tasks" : "home");
  }
  // Lists and the week's days scroll under a finger. A swipe scrolls one while it has
  // further to go that way, and changes page once it doesn't. A flick keeps it gliding.
  const scrollerAt = (target, axis) => target?.closest?.(axis === "y" ? ".scroll-y" : ".scroll-x");
  function canScroll(el, axis, ahead) {
    if (!el) return false;
    const [at, size, shown] = axis === "y"
      ? [el.scrollTop, el.scrollHeight, el.clientHeight] : [el.scrollLeft, el.scrollWidth, el.clientWidth];
    return ahead > 0 ? at < size - shown - 1 : at > 1;
  }
  let gliding = 0;
  function glide(el, axis, speed) {
    cancelAnimationFrame(gliding);
    if (calm) return;
    let last = performance.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      speed *= 0.95 ** (dt / 16);
      if (Math.abs(speed) < 0.02) return;
      if (axis === "y") el.scrollTop += speed * dt;
      else el.scrollLeft += speed * dt;
      gliding = requestAnimationFrame(step);
    };
    gliding = requestAnimationFrame(step);
  }
  function moveScroll(s, moved, at) {
    if (s.axis === "y") s.el.scrollTop = s.from - moved;
    else s.el.scrollLeft = s.from - moved;
    const dt = at - s.at;
    if (dt > 0) s.speed = 0.8 * ((s.last - moved) / dt) + 0.2 * s.speed;
    s.last = moved;
    s.at = at;
  }

  document.body.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(gliding);
    if (!e.isPrimary || view === "map" || editingMenu() || !$("send-drawer").hidden || document.body.classList.contains("night")) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, target: e.target };
  });
  document.body.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.scroll) {
      moveScroll(drag.scroll, drag.scroll.axis === "y" ? dy : dx, e.timeStamp);
      return;
    }
    if (!drag.on) {
      const vertical = Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx);
      if (!vertical && Math.abs(dx) < 12) return;
      const axis = vertical ? "y" : "x";
      const moved = vertical ? dy : dx;
      const list = scrollerAt(drag.target, axis);
      if (canScroll(list, axis, -Math.sign(moved))) {
        drag.on = true;
        drag.scroll = { el: list, axis, from: axis === "y" ? list.scrollTop : list.scrollLeft, last: moved, at: e.timeStamp, speed: 0 };
        try { document.body.setPointerCapture(e.pointerId); } catch { /* the pointer already went */ }
        return;
      }
      if (vertical && !canLift(dy)) { drag = null; return; }
      if (!vertical && view === "tasks") { drag = null; return; }
      drag.on = true;
      drag.lift = vertical;
      // The tasks page is drawn before it comes into view, so it isn't empty on the way in.
      if (vertical && view === "home") renderTasksPage();
      document.body.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
    }
    if (drag.lift) moveLift(dy);
    else moveDrag(dx);
  });
  // A mouse wheel or trackpad does the same as swiping up and down.
  // A list that can still scroll takes the wheel, and a trackpad's glide after reaching the
  // end of a list doesn't then change the page.
  let wheeled = 0;
  let listWheeled = 0;
  addEventListener("wheel", (e) => {
    if (canScroll(scrollerAt(e.target, "y"), "y", Math.sign(e.deltaY))) {
      listWheeled = Date.now();
      return;
    }
    if (Date.now() - listWheeled < 600) return;
    if (stacked() || Date.now() - wheeled < 700 || Math.abs(e.deltaY) < 20 || editingMenu() || !$("send-drawer").hidden) return;
    if (!canLift(-e.deltaY)) return;
    wheeled = Date.now();
    setView(view === "home" ? "tasks" : "home");
  }, { passive: true });
  document.body.addEventListener("pointerup", endDrag);
  document.body.addEventListener("pointercancel", endDrag);

  // The AI can take minutes on a Pi, so a request becomes a row and the board stays usable.
  function setJob(next) {
    job = next;
    if (state) renderRows();
  }

  // Touch mode keyboard
  function buildKeyboard(box, field, typed = () => {}) {
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    const key = (k, cls = "") => `<button type="button" class="key ${cls}" data-key="${k}">${k}</button>`;
    box.innerHTML =
      rows.map((r) => `<div class="key-row">${[...r].map((k) => key(k)).join("")}</div>`).join("") +
      `<div class="key-row">${key("Shift", "wide")}${key("123", "wide")}${key("Space", "space")}${key("Delete", "wide")}</div>`;
    let shift = false;
    let digits = false;
    const engaged = (name, on) => {
      const k = box.querySelector(`[data-key="${name}"]`);
      k.classList.toggle("on", on);
      k.setAttribute("aria-pressed", on);
    };
    const redraw = () => {
      engaged("Shift", shift);
      engaged("123", digits);
      const keys = box.querySelectorAll(".key-row:nth-child(-n+3) .key");
      const glyphs = digits ? "1234567890-/:;()$&@.,?!'\"#".split("") : null;
      keys.forEach((k, i) => {
        k.textContent = glyphs ? glyphs[i] : k.dataset.key;
        if (!glyphs) k.textContent = shift ? k.dataset.key.toUpperCase() : k.dataset.key;
      });
    };
    box.onclick = (e) => {
      const k = e.target.closest(".key");
      if (!k) return;
      const v = k.dataset.key;
      if (v === "Shift") { shift = !shift; redraw(); return; }
      if (v === "123") { digits = !digits; redraw(); return; }
      if (v === "Delete") field.value = field.value.slice(0, -1);
      else field.value += v === "Space" ? " " : k.textContent;
      if (shift) { shift = false; redraw(); }
      typed();
    };
  }

  function setWall(on) {
    document.body.classList.toggle("wall", on);
  }

  // The tasks page: every task by category, and one task's milestones. Categories and their
  // colors are kept on the server. A course from Brightspace is a category already.
  const PALETTE = [["#E8A33D", "Amber"], ["#4FB6A0", "Teal"], ["#8C9EFF", "Blue"], ["#E07A9B", "Rose"],
    ["#9CCC65", "Green"], ["#C792EA", "Violet"], ["#F28C60", "Orange"], ["#6EC6E8", "Sky"]];
  const GROUPS = ["Late", "Today", "This week", "Later", "No date"];
  let onTaskInfo = () => {};
  let onCategories = () => {};
  const saved = () => state?.categories ?? [];
  const pageTasks = () => (state?.allTasks ?? []).filter((t) => !done.has(t.id) && !removed.has(t.id));
  const findTask = (id) => (state?.allTasks ?? []).find((t) => t.id === id);

  // Recently done: anything ticked on this screen first, then what the server remembers,
  // leaving out any put back since.
  function doneList() {
    const here = (state?.allTasks ?? []).filter((t) => done.has(t.id))
      .map((t) => ({ ...t, time: "Today", doneWhen: "Done just now", finished: true }));
    const ids = new Set(here.map((t) => t.id));
    return [...here, ...(state?.doneTasks ?? [])
      .filter((t) => !ids.has(t.id) && !restored.has(t.id))
      .map((t) => ({ ...t, finished: true }))];
  }
  function restore(id) {
    const task = doneList().find((t) => t.id === id);
    if (!task) return;
    done.delete(id);
    removed.delete(id);
    restored.add(id);
    onTask(id, false);
    toast(`Back on your list: ${task.title}`);
    renderRows();
    renderTasksPage();
  }

  // The saved categories, then any others in use, such as a new course.
  function categoryNames() {
    const used = (state?.allTasks ?? []).map((t) => t.category).filter(Boolean);
    return [...new Set([...saved().map((c) => c.name), ...used])];
  }
  // A category keeps the color it was given. One without yet takes the next free color, and
  // keepColors saves it so it never shifts.
  function colorOf(name) {
    if (!name) return "";
    const kept = saved().find((c) => c.name === name)?.color;
    if (kept) return kept;
    const taken = new Set(saved().map((c) => c.color));
    const free = PALETTE.map(([c]) => c).filter((c) => !taken.has(c));
    const pool = free.length ? free : PALETTE.map(([c]) => c);
    const waiting = categoryNames().filter((n) => !saved().some((c) => c.name === n && c.color)).sort();
    return pool[Math.max(0, waiting.indexOf(name)) % pool.length];
  }
  let keptKey = "";
  function keepColors() {
    const missing = categoryNames().filter((n) => !saved().some((c) => c.name === n && c.color));
    if (!missing.length || missing.join("|") === keptKey) return;
    keptKey = missing.join("|");
    setCategories([...saved().filter((c) => c.color), ...missing.map((name) => ({ name, color: colorOf(name) }))]);
  }
  function nextColor() {
    const taken = new Set(categoryNames().map(colorOf));
    return (PALETTE.find(([c]) => !taken.has(c)) ?? PALETTE[categoryNames().length % PALETTE.length])[0];
  }
  function setCategories(list) {
    state.categories = list;
    onCategories(list);
  }
  const tag = (color) => (color ? `<i class="tag" style="--tag:${color}"></i>` : "");

  function moveTask(id, category) {
    const task = findTask(id);
    if (!task || task.category === category) return;
    task.category = category;
    const row = state.tasks.find((r) => r.id === id);
    if (row) row.category = category;
    onTaskInfo(id, { category });
    renderRows();
  }
  function setSteps(task, steps) {
    task.steps = steps;
    task.progress = steps.length ? `${steps.filter((s) => s.done).length} of ${steps.length}` : "";
    onTaskInfo(task.id, { steps: steps.map(({ id, title, due, done: finished }) => ({ id, title, due, done: finished })) });
    renderTasksPage();
  }

  // The list on the left, and the chosen task on the right: the first one until one is tapped.
  function renderTasksPage() {
    if (!state) return;
    keepColors();
    renderCategories();
    renderColors();
    const shown = renderTaskList();
    if (!shown.some((t) => t.id === tpOpen)) {
      tpOpen = shown[0]?.id ?? null;
      tpMoving = false;
    }
    $("tp-rows").querySelectorAll(".tp-row").forEach((row) => row.classList.toggle("is-picked", row.dataset.id === tpOpen));
    renderDetail(tpOpen && shown.find((t) => t.id === tpOpen));
  }

  function renderCategories() {
    const names = categoryNames();
    const tasks = pageTasks();
    const others = tasks.some((t) => !t.category) && names.length > 0;
    if ((tpCat === "" && !others) || (tpCat && !names.includes(tpCat))) tpCat = null;
    const count = (name) => tasks.filter((t) => name === null || t.category === name).length;
    const button = (name, text) => `<button type="button" class="tp-cat" data-cat="${name === null ? "*" : esc(name)}"
      aria-pressed="${!tpDone && tpCat === name}">${tag(colorOf(name))}<span>${esc(text)}</span><b>${count(name)}</b></button>`;
    $("tp-cats").innerHTML = button(null, "All") + names.map((n) => button(n, shortName(n))).join("")
      + (others ? button("", "Other") : "")
      + `<button type="button" class="tp-cat" data-done="1" aria-pressed="${tpDone}"><span>Done</span><b>${doneList().length}</b></button>`
      + `<button type="button" class="tp-cat is-add" id="tp-new-cat" aria-label="New category">+</button>`;
  }

  // With one category showing, its color can be changed, and an empty one removed.
  function renderColors() {
    const bar = $("tp-color");
    bar.hidden = !tpCat || tpDone;
    if (bar.hidden) return;
    const empty = !pageTasks().some((t) => t.category === tpCat);
    bar.innerHTML = `<span>Color</span>${PALETTE.map(([c, name]) => `<button type="button" class="swatch"
      data-color="${c}" style="--tag:${c}" aria-label="${name}" aria-pressed="${colorOf(tpCat) === c}"></button>`).join("")}
      ${empty ? `<button type="button" class="head-link" id="tp-remove-cat">Remove</button>` : ""}`;
  }

  function renderTaskList() {
    $("tp-rows").dataset.empty = tpDone ? "Nothing finished in the last two weeks" : "Nothing here";
    if (tpDone) {
      const finished = doneList();
      $("tp-rows").innerHTML = finished.map((t) => {
        const color = colorOf(t.category);
        return `<li class="tp-done-item"><button type="button" class="row tp-row is-finished${color ? " has-tag" : ""}" style="--tag:${color}" data-id="${esc(t.id)}">
          <span class="row-time">${esc(t.time)}</span><span class="row-title">${esc(t.title)}</span></button>
          <button type="button" class="tp-restore" data-restore="${esc(t.id)}">Not done</button></li>`;
      }).join("");
      fitList("tp-rows");
      return finished;
    }
    const tasks = pageTasks().filter((t) => tpCat === null || t.category === tpCat)
      .sort((a, b) => a.due.localeCompare(b.due));
    $("tp-rows").innerHTML = GROUPS.flatMap((group) => {
      const these = tasks.filter((t) => t.group === group);
      return these.length ? [`<li class="tp-group">${group}</li>`, ...these.map((t) => {
        const color = colorOf(t.category);
        return `<li><button type="button" class="row tp-row${color ? " has-tag" : ""}" style="--tag:${color}" data-id="${esc(t.id)}">
          <span class="row-time">${esc(t.time)}</span><span class="row-title">${esc(t.title)}</span>
          <span class="row-detail">${esc(t.progress)}</span></button></li>`;
      })] : [];
    }).join("");
    fitList("tp-rows");
    return tasks;
  }

  function renderDetail(task) {
    const box = $("tp-detail");
    if (!task && tpDone) {
      box.innerHTML = `<p class="tp-none">Tasks you tick off show here for two weeks, so one done by mistake can go back on your list.</p>`;
      return;
    }
    if (task?.finished) {
      box.innerHTML = `
        <h3 class="tp-title">${esc(task.title)}</h3>
        <p class="tp-meta">${esc(task.doneWhen)}</p>
        <p class="tp-meta">${esc(task.when)}${task.from ? `. ${esc(task.from)}` : ""}</p>
        ${task.progress ? `<p class="tp-meta">Milestones: ${esc(task.progress)}</p>` : ""}
        <div class="ask-actions tp-actions tp-push"><button type="button" class="primary" data-restore="${esc(task.id)}">Not done</button></div>`;
      return;
    }
    if (!task) {
      box.innerHTML = `<p class="tp-none">${tpCat === null ? "Nothing to do. Add a task, or send assignments from your phone." : "Nothing in this category."}</p>`;
      return;
    }
    if (tpMoving) {
      const choices = [...categoryNames().map((n) => [n, shortName(n)]), ["", "Other"]];
      box.innerHTML = `<header class="board-head tp-side-head"><h3>Move ${esc(task.title)} to</h3>
        <button type="button" class="head-link" data-back="1">Back</button></header>
        <ul class="menu-rows tp-moves">${choices.map(([name, text]) => `<li>
        <button type="button" class="menu-row is-action" data-cat="${esc(name)}">
          <span class="tp-cat-name">${tag(colorOf(name))}${esc(text)}</span>
          <span class="menu-value">${task.category === name ? "Now" : ""}</span></button></li>`).join("")}
        <li><button type="button" class="menu-row is-action" data-new="1">New category</button></li></ul>`;
      return;
    }
    box.innerHTML = `
      <h3 class="tp-title">${esc(task.title)}</h3>
      <p class="tp-meta">${esc(task.when)}${task.from ? `. ${esc(task.from)}` : ""}</p>
      <button type="button" class="menu-row is-action" id="tp-move"><span>Category</span>
        <span class="tp-cat-name">${tag(colorOf(task.category))}${esc(task.category ? shortName(task.category) : "Other")}</span></button>
      <div class="tp-steps-head"><h4>Milestones</h4><span>${esc(task.progress)}</span></div>
      <ol class="tp-steps" data-empty="No milestones yet. Break it into steps, each with its own date.">${task.steps.map((s) => `
        <li class="tp-step${s.done ? " is-done" : ""}"><label><input type="checkbox" data-step="${esc(s.id)}"${s.done ? " checked" : ""}>
          <span class="tp-step-title">${esc(s.title)}</span><span class="tp-step-when">${esc(s.when ?? "")}</span></label>
          <button type="button" class="tp-step-remove" data-remove="${esc(s.id)}" aria-label="Remove ${esc(s.title)}">×</button></li>`).join("")}</ol>
      <div class="ask-actions tp-actions"><button type="button" id="tp-add-step">Add a milestone</button>
        <button type="button" class="primary" id="tp-done">Mark done</button></div>`;
  }

  $("tp-add-task").onclick = () => openEntry({ kind: "task" });
  $("tp-cats").onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.id === "tp-new-cat") { openEntry({ kind: "category" }); return; }
    tpDone = !!button.dataset.done;
    if (!tpDone) tpCat = button.dataset.cat === "*" ? null : button.dataset.cat;
    $("tp-rows").scrollTop = 0;
    renderTasksPage();
  };
  $("tp-color").onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const list = saved().filter((c) => c.name !== tpCat);
    if (button.id === "tp-remove-cat") {
      setCategories(list);
      tpCat = null;
    } else {
      const at = saved().findIndex((c) => c.name === tpCat);
      list.splice(at < 0 ? list.length : at, 0, { name: tpCat, color: button.dataset.color });
      setCategories(list);
      renderRows();
    }
    renderTasksPage();
  };
  let dropped = 0;
  $("tp-rows").onclick = (e) => {
    const back = e.target.closest("[data-restore]");
    if (back) { restore(back.dataset.restore); return; }
    const row = e.target.closest(".tp-row");
    if (!row || Date.now() - dropped < 300) return;
    tpOpen = row.dataset.id;
    renderTasksPage();
  };
  $("tp-detail").onclick = (e) => {
    const back = e.target.closest("[data-restore]");
    if (back) { restore(back.dataset.restore); return; }
    const task = findTask(tpOpen);
    const hit = e.target.closest("button, input");
    if (!task || !hit) return;
    if (tpMoving) {
      if (hit.dataset.back) { tpMoving = false; renderTasksPage(); return; }
      if (hit.dataset.new) { openEntry({ kind: "category", task: task.id }); return; }
      if (hit.dataset.cat === undefined) return;
      moveTask(task.id, hit.dataset.cat);
      tpMoving = false;
      renderTasksPage();
      return;
    }
    if (hit.id === "tp-move") { tpMoving = true; renderTasksPage(); }
    else if (hit.id === "tp-add-step") openEntry({ kind: "step", task: task.id });
    else if (hit.id === "tp-done") {
      finishTodo(task, true);
      tpOpen = null;
      renderTasksPage();
    } else if (hit.dataset.remove) setSteps(task, task.steps.filter((s) => s.id !== hit.dataset.remove));
    else if (hit.dataset.step) setSteps(task, task.steps.map((s) => (s.id === hit.dataset.step ? { ...s, done: hit.checked } : s)));
  };

  // Adding a milestone, a task or a category: a name, and for the first two, a day.
  let entry = null;
  let entryDue = null;
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).getTime();
  function openEntry(next) {
    entry = next;
    const dated = next.kind !== "category";
    $("tp-entry-label").textContent = { step: "Add a milestone", task: "Add a task", category: "New category" }[next.kind];
    $("tp-entry-text").placeholder = { step: "Outline", task: "What needs doing", category: "Personal" }[next.kind];
    $("tp-entry-text").value = "";
    $("tp-entry-problem").textContent = "";
    $("tp-when").hidden = !dated;
    entryDue = null;
    drawEntryDay();
    $("tp-entry").hidden = false;
    if (!document.body.classList.contains("wall")) $("tp-entry-text").focus();
  }
  function drawEntryDay() {
    const today = endOfDay(new Date());
    $("tp-day").textContent = entryDue === null ? "No date" : entryDue === today ? "Today"
      : new Date(entryDue).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    $("tp-no-date").setAttribute("aria-pressed", entryDue === null);
  }
  function stepDay(by) {
    const today = endOfDay(new Date());
    if (entryDue === null) entryDue = by > 0 ? today : null;
    else {
      const d = new Date(entryDue);
      d.setDate(d.getDate() + by);
      entryDue = d.getTime() < today ? null : endOfDay(d);
    }
    drawEntryDay();
  }
  $("tp-later").onclick = () => stepDay(1);
  $("tp-earlier").onclick = () => stepDay(-1);
  $("tp-no-date").onclick = () => { entryDue = null; drawEntryDay(); };
  $("tp-entry-close").onclick = () => { $("tp-entry").hidden = true; };
  $("tp-entry").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("tp-entry-text").value.trim();
    if (!text) return;
    if (entry.kind === "category") {
      if (!categoryNames().includes(text)) setCategories([...saved(), { name: text, color: nextColor() }]);
      if (entry.task) {
        moveTask(entry.task, text);
        tpMoving = false;
      } else tpCat = text;
    } else if (entry.kind === "step") {
      const task = findTask(entry.task);
      const id = `step/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      if (task) setSteps(task, [...task.steps, { id, title: text, due: entryDue, done: false }]);
    } else {
      try {
        await onAddTask(text, entryDue, tpCat || "");
      } catch (error) {
        $("tp-entry-problem").textContent = error.message;
        return;
      }
    }
    $("tp-entry").hidden = true;
    renderTasksPage();
  };

  // Hold a task to pick it up, then drop it on a category to move it there. Moving the finger
  // before the hold lets the swipe have it instead.
  const HOLD_MS = 450;
  $("tp-rows").addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".tp-row:not(.is-finished)");
    if (!row || !e.isPrimary) return;
    const from = { x: e.clientX, y: e.clientY };
    const timer = setTimeout(() => { off(); pickUp(row, e.pointerId, from); }, HOLD_MS);
    const cancel = (ev) => {
      if (ev.type === "pointermove" && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 10) return;
      clearTimeout(timer);
      off();
    };
    const off = () => ["pointermove", "pointerup", "pointercancel"].forEach((t) => removeEventListener(t, cancel));
    ["pointermove", "pointerup", "pointercancel"].forEach((t) => addEventListener(t, cancel));
  });
  function pickUp(row, pointerId, from) {
    drag = null;
    // A small copy floats just above the finger, so the category under it stays in sight.
    const box = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add("tp-ghost");
    Object.assign(ghost.style, { left: `${from.x - 2 * rem()}px`, top: `${from.y - box.height - rem()}px`, width: `${Math.min(box.width, 20 * rem())}px` });
    document.body.append(ghost);
    row.classList.add("is-held");
    held = { id: row.dataset.id, row, ghost, from, over: null };
    try { document.body.setPointerCapture(pointerId); } catch { /* the pointer already went */ }
    if (!calm) ghost.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }], { duration: 160, fill: "forwards" });
  }
  addEventListener("pointermove", (e) => {
    if (!held) return;
    held.ghost.style.translate = `${e.clientX - held.from.x}px ${e.clientY - held.from.y}px`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".tp-cat:not(.is-add)") ?? null;
    if (over === held.over) return;
    held.over?.classList.remove("is-target");
    over?.classList.add("is-target");
    held.over = over;
  });
  function drop() {
    if (!held) return;
    const { id, row, ghost, over } = held;
    held = null;
    ghost.remove();
    row.classList.remove("is-held");
    dropped = Date.now();
    if (over && over.dataset.cat !== "*") {
      const name = over.dataset.cat;
      moveTask(id, name);
      toast(`Moved to ${name ? shortName(name) : "Other"}`);
    }
    renderTasksPage();
  }
  addEventListener("pointerup", drop);
  addEventListener("pointercancel", drop);
  // On a phone the page scrolls, so a held task stops it scrolling until it's dropped.
  addEventListener("touchmove", (e) => { if (held) e.preventDefault(); }, { passive: false });

  buildKeyboard($("keyboard"), input);
  buildKeyboard($("search-keys"), $("search-text"), renderResults);
  buildKeyboard($("add-keys"), $("add-text"));
  buildKeyboard($("tp-keys"), $("tp-entry-text"));
  addEventListener("resize", () => { if (state) { fitLists(); fitSegments(); sizeRows(); } });
  document.fonts.ready.then(() => { if (state) { fitLists(); fitSegments(); } });
  setWall(location.hash === "#wall");
  addEventListener("hashchange", () => setWall(location.hash === "#wall"));

  drawSettings();
  return {
    render, setJob, setWall, moveTrains, settings, shortName,
    loadSettings: (next) => { Object.assign(settings, next); drawSettings(); },
    loadStatus: (next) => { status = next; drawSettings(); },
    onUnrepeat: (fn) => { onUnrepeat = fn; },
    // Something is being typed or held, so the page shouldn't reload under it.
    busy: () => editingMenu() || !$("send-drawer").hidden || !!held,
    onAsk: (fn) => { onAsk = fn; },
    onSettings: (fn) => { onSettings = fn; },
    onTask: (fn) => { onTask = fn; },
    onAddTask: (fn) => { onAddTask = fn; },
    onLink: (fn) => { onLink = fn; },
    onSkip: (fn) => { onSkip = fn; },
    onTaskInfo: (fn) => { onTaskInfo = fn; },
    onCategories: (fn) => { onCategories = fn; },
  };
})();
