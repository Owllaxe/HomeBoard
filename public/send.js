// The phone and laptop page: paste assignment descriptions, or say how to change the schedule.
(() => {
  const $ = (id) => document.getElementById(id);
  const prompts = {
    assignments: ["Paste an assignment description, or a whole list. It can be as messy as it comes.", "Dynamics quiz 4 is Thursday at 9:30 on Gradescope"],
    chat: ["Say what should change, or ask about your week.", "Move study group to Thursday at 6"],
  };
  const stateText = { waiting: "waiting for the AI", working: "working on it", done: "done", failed: "didn't go through" };
  // The mode you last used, remembered on this device.
  const remembered = (() => { try { return localStorage.getItem("send-kind"); } catch { return null; } })();
  let kind = remembered === "chat" ? "chat" : "assignments";
  let shown = "";
  // Inside the board on a laptop, the board has the heading, and is told when to redraw.
  const embedded = window.parent !== window && new URLSearchParams(location.search).has("embed");
  document.body.classList.toggle("embedded", embedded);
  const tellBoard = (message) => { if (embedded) window.parent.postMessage(message, location.origin); };
  let finished = null;

  async function call(method, path, body) {
    let response;
    try {
      response = await fetch(path, {
        method,
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error("Can't reach the board. Is your phone on the same Wi-Fi?");
    }
    const reply = await response.json();
    if (response.status === 401) showPair();
    if (!response.ok) throw new Error(reply.error);
    return reply;
  }

  function showPair() {
    $("pair").hidden = false;
    $("main").hidden = true;
  }

  function drawKind() {
    document.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.kind === kind));
    const [prompt, example] = prompts[kind];
    $("prompt").textContent = prompt;
    $("text").placeholder = example;
  }

  function messageItem(m) {
    const li = document.createElement("li");
    li.className = `message${m.from === "board" ? " is-board" : ""}${m.status === "failed" ? " is-failed" : ""}`;
    const text = document.createElement("p");
    text.textContent = m.text;
    const meta = document.createElement("p");
    meta.className = "meta";
    const state = document.createElement("span");
    state.className = "state";
    const time = new Date(m.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
    state.textContent = m.from === "board" ? time : `${time}, ${stateText[m.status]}`;
    meta.append(state);
    if (m.status === "failed") {
      const retry = document.createElement("button");
      retry.className = "retry";
      retry.type = "button";
      retry.textContent = "Try again";
      retry.onclick = () => call("POST", `/api/chat/${m.id}/retry`).then(draw).catch(() => {});
      meta.append(retry);
    }
    li.append(text, meta);
    return li;
  }

  // Newest first, and only redrawn when something changed, so reading isn't interrupted.
  function draw({ messages, ai }) {
    $("pair").hidden = true;
    $("main").hidden = false;
    $("waiting").hidden = ai.available;
    const key = JSON.stringify(messages.map((m) => [m.id, m.status]));
    if (key === shown) return;
    shown = key;
    // Something newly done may have changed the board, so it redraws now rather than later.
    const done = messages.filter((m) => m.status === "done").map((m) => m.id);
    if (finished && done.some((id) => !finished.has(id))) tellBoard("board-changed");
    finished = new Set(done);
    $("thread").replaceChildren(...[...messages].reverse().map(messageItem));
  }

  const refresh = () => call("GET", "/api/chat").then(draw).catch(() => {});

  document.querySelector(".modes").onclick = (e) => {
    if (!e.target.dataset.kind) return;
    kind = e.target.dataset.kind;
    try { localStorage.setItem("send-kind", kind); } catch { /* it just won't be remembered */ }
    drawKind();
  };

  $("compose").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("text").value.trim();
    if (!text) return;
    $("problem").textContent = "";
    $("send").disabled = true;
    try {
      draw(await call("POST", "/api/chat", { text, kind }));
      $("text").value = "";
    } catch (error) {
      $("problem").textContent = error.message;
    }
    $("send").disabled = false;
  };

  // Ctrl+Enter (or Cmd+Enter) sends, and Esc closes the panel on the board.
  $("text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("compose").requestSubmit();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") tellBoard("send-close"); });

  $("pair").onsubmit = async (e) => {
    e.preventDefault();
    $("pair-problem").textContent = "";
    try {
      await call("POST", "/api/pair", { code: $("pair-code").value.trim() });
      await refresh();
    } catch (error) {
      $("pair-problem").textContent = error.message;
    }
  };

  drawKind();
  refresh();
  setInterval(() => { if ($("pair").hidden) refresh(); }, 4000);
})();
