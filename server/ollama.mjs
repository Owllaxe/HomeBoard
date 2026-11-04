// Connects the AI box to a model running in Ollama. It sends only what a request needs, because
// a long prompt can take many minutes on a Pi. The model copies days and times as words, and
// when.mjs works out the dates, because small models get that wrong. See ai.mjs for what a
// provider has to return.
import { daysIn, moment, readDay, readTime } from "./when.mjs";

const CONTEXT_SIZE = 4096;
const MOST_TASKS_LISTED = 30;

const words = { type: ["string", "null"] };
const SCHEMA = {
  assignments: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, day: words, time: words, detail: words },
          required: ["title", "day", "time", "detail"],
        },
      },
    },
    required: ["tasks"],
  },
  chat: {
    type: "object",
    properties: {
      reply: { type: "string" },
      add_tasks: {
        type: "array",
        items: { type: "object", properties: { title: { type: "string" }, day: words, time: words }, required: ["title", "day", "time"] },
      },
      add_events: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, place: words, day: { type: "string" }, start: { type: "string" }, end: words },
          required: ["title", "place", "day", "start", "end"],
        },
      },
      move_events: {
        type: "array",
        items: { type: "object", properties: { ref: { type: "string" }, day: words, time: { type: "string" } }, required: ["ref", "day", "time"] },
      },
      remove_events: { type: "array", items: { type: "string" } },
      sort_tasks: {
        type: "array",
        items: { type: "object", properties: { ref: { type: "string" }, category: { type: "string" } }, required: ["ref", "category"] },
      },
      redate_tasks: {
        type: "array",
        items: { type: "object", properties: { ref: { type: "string" }, day: words, time: words }, required: ["ref", "day", "time"] },
      },
      finish_tasks: { type: "array", items: { type: "string" } },
    },
    required: ["reply", "add_tasks", "add_events", "move_events", "remove_events", "sort_tasks", "redate_tasks", "finish_tasks"],
  },
};
const NOTHING = '"add_tasks":[],"add_events":[],"move_events":[],"remove_events":[],"sort_tasks":[],"redate_tasks":[],"finish_tasks":[]';
// An example reply: one list filled in, the rest empty.
const example = (reply, list, value) => `{"reply":"${reply}",${NOTHING.replace(`"${list}":[]`, `"${list}":${value}`)}}`;

const clockText = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
const dayText = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

function assignmentPrompt({ tasks }) {
  const have = tasks.slice(0, MOST_TASKS_LISTED).map((t) => `- ${t.title}`).join("\n") || "(nothing)";
  return `You read text a student pasted and list every quiz, test, homework, project or other work in it, as JSON.
For each one give:
- title: a short name, without the date
- day: the day exactly as written, such as Friday or Nov 12, or null if none is given
- time: the time exactly as written, such as 5pm, or null if none is given
- detail: where it's handed in, such as Gradescope, or null
Never invent a day or time. Leave out anything on the ALREADY HAVE list. Leave out rules and general advice.

ALREADY HAVE:
${have}

Example. The text "Essay 2 due Friday at 3pm on Canvas, late work loses points" gives:
{"tasks":[{"title":"Essay 2","day":"Friday","time":"3pm","detail":"Canvas"}]}

Reply with only that JSON, one entry per item.`;
}

function eventLine(event, i) {
  const time = event.allDay ? "all day" : `${clockText(event.start)} to ${clockText(event.end)}`;
  return `E${i + 1} | ${dayText(event.start)} | ${time} | ${event.title}`;
}

const taskLine = (task, i) => `T${i + 1} | ${task.title} | ${task.due ? `due ${dayText(task.due)}, ${clockText(task.due)}` : "no due date"}${task.category ? ` | ${task.category}` : ""}`;

function chatPrompt({ now, events, tasks, categories = [] }, history) {
  const said = history.slice(-4).map((m) => `${m.from === "you" ? "Student" : "You"}: ${m.text.slice(0, 200)}`).join("\n");
  return `You manage a student's schedule and tasks, as JSON. Only do what the message asks. Change nothing else.
- reply: one short plain sentence. Use it to answer questions from the EVENTS and TASKS lists.
- add_tasks: new things to do or remember
- add_events: new events
- move_events: an event going to a new time, using its ref from EVENTS
- remove_events: refs of events being cancelled or skipped
- sort_tasks: tasks going into a category, one entry for each task, using its ref from TASKS
- redate_tasks: a task with a new due day or time, using its ref from TASKS
- finish_tasks: refs of tasks that are done or no longer needed
A question changes nothing, so all the lists stay empty.
"Remind me" and "I need to" mean add_tasks. Saying it in reply isn't enough.
Copy days and times exactly as the student wrote them, such as Thursday or 6pm.
Pick refs carefully: the name, and for an event its day, must match.

Today is ${dayText(now)}.

EVENTS:
${events.map(eventLine).join("\n") || "(none)"}

TASKS (ref | name | due | category):
${tasks.slice(0, MOST_TASKS_LISTED).map(taskLine).join("\n") || "(none)"}

CATEGORIES: ${categories.join(", ") || "(none yet)"}
${said ? `\nEARLIER:\n${said}\n` : ""}
Reply with only this JSON, leaving out nothing:
{"reply":"...",${NOTHING}}

Examples, for imaginary lists where E2 is Monday's Chemistry, T3 is Lab report 4 and T4 is Lab report 5:
"Remind me to call the bank by Friday" gives
${example("Added.", "add_tasks", '[{"title":"Call the bank","day":"Friday","time":null}]')}
"I'm skipping Monday's Chemistry" gives
${example("Removed.", "remove_events", '["E2"]')}
"Move Chemistry to Friday at 6pm" gives
${example("Moved.", "move_events", '[{"ref":"E2","day":"Friday","time":"6pm"}]')}
"Add dentist on Friday from 2 to 3pm" gives
${example("Added.", "add_events", '[{"title":"Dentist","place":null,"day":"Friday","start":"2pm","end":"3pm"}]')}
"Put the lab reports under Science" gives
${example("Sorted.", "sort_tasks", '[{"ref":"T3","category":"Science"},{"ref":"T4","category":"Science"}]')}
"Lab report 4 is now due Thursday" gives
${example("Changed.", "redate_tasks", '[{"ref":"T3","day":"Thursday","time":null}]')}
"I finished lab report 5" gives
${example("Done.", "finish_tasks", '["T4"]')}`;
}

// Small models wrap their JSON in code fences or chat, so this takes the part that matters.
// A bare list of assignments counts, and so does a plain sentence answering a chat message,
// which can't change anything.
function readJson(text, kind) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const list = JSON.parse(trimmed);
      return kind === "assignments" ? { tasks: list } : {};
    } catch { /* tried as an object below */ }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (kind === "chat" && start < 0 && trimmed) return { reply: trimmed.slice(0, 300) };
  if (start < 0 || end < start) throw new Error("The model didn't answer in the expected format");
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new Error("The model didn't answer in the expected format");
  }
}

// A plain question never changes anything, whatever the model says. "Can you move it?" is a
// request, so only questions that ask for information count.
const ASKING = /^\s*(what|what's|whats|when|when's|where|where's|which|who|how|do i|am i|is|are|does)\b.*\?\s*$/i;
const MOVING = /\b(move|push|reschedule|shift)\b/;
const CANCELLING = /\b(cancel\w*|skip\w*|remove|drop|no more)\b|\btake\b.*\boff\b/;
const simple = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
const END_OF_DAY = [23, 59];
// Words too general to say which event someone means, so "cancel my class" names nothing.
const GENERAL = new Set(["class", "classes", "course", "the", "and", "for", "with", "meeting", "event"]);
const titleWords = (title) => title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERAL.has(w));

// Small models invent days, so one only counts if it's a day the message really names,
// however it's written. "Nov 14" is fine when the message said 11/14.
const saidDay = (day, said, now) => (daysIn(said, now).has(readDay(day, now)?.getTime()) ? day : null);
function saidTime(time, said) {
  const digits = String(time ?? "").match(/\d+/)?.[0];
  return (digits && said.includes(digits)) || /noon|midnight/.test(time ?? "") ? time : null;
}

// The events the message names, best match first. A small model can point at the wrong line,
// and moving or removing the wrong event is the worst mistake it can make here.
function namedEvents(events, said) {
  const scored = events.map((event) => ({ event, score: titleWords(event.title).filter((w) => said.includes(w)).length }));
  const best = Math.max(0, ...scored.map((s) => s.score));
  return best ? scored.filter((s) => s.score === best).map((s) => s.event) : [];
}

// The tasks the message names, best match first. Numbers count, so "post 8" means AHS Post 08
// and not AHS Post 09, while "the AHS posts" means all of them.
const TASK_GENERAL = new Set(["the", "and", "for", "with", "task", "tasks", "assignment", "assignments", "due", "all", "my", "category"]);
const NUMBER = /^\d+$/;
const taskWords = (title) => title.toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => NUMBER.test(w) || (w.length > 2 && !TASK_GENERAL.has(w)))
  .map((w) => (NUMBER.test(w) ? String(Number(w)) : w));
function namedTasks(tasks, said) {
  const numbers = new Set((said.match(/\d+/g) ?? []).map((n) => String(Number(n))));
  const scored = tasks.map((task) => ({
    task, score: taskWords(task.title).filter((w) => (NUMBER.test(w) ? numbers.has(w) : said.includes(w))).length,
  }));
  const best = Math.max(0, ...scored.map((s) => s.score));
  return best ? scored.filter((s) => s.score === best).map((s) => s.task) : [];
}

// A category the student named: an existing one when its name has all their words, or a
// new one in their own words. One they never said is an invention, and doesn't count.
const SMALL = new Set(["and", "of", "the", "in", "on", "for", "to", "a"]);
function categoryFor(text, categories, said) {
  const wanted = String(text ?? "").trim().replace(/\s+category$/i, "");
  const words = wanted.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2 && !TASK_GENERAL.has(w));
  if (!words.length || !words.some((w) => said.includes(w))) return null;
  const existing = categories.find((c) => words.every((w) => c.toLowerCase().includes(w)));
  if (existing) return existing;
  return wanted.toLowerCase().split(/\s+/).map((w, i) => (i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
}
// "All", "every" or "each" means every task the message names, even any the model left out.
const ALL = /\b(all|every|each)\b/;

// "Move all 8pm Math Classes in future weeks to 7pm" is a repeating change. The model only sees
// the next 8 days, so the code reads it from the message: the class it names, the time before
// "to" if there is one, the time after it, and a weekday said as "Wednesdays" or "every Wednesday".
const SERIES = /\b(every|each|all|future|from now on|going forward|weekly|recurring|starting)\b/;
const CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\bnoon\b/g;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function weekdayIn(said) {
  const found = said.match(/\b(sun|mon|tues|wednes|thurs|fri|satur)days\b/)?.[1] ?? said.match(/\bevery\s+(sun|mon|tue|wed|thu|fri|sat)/)?.[1];
  return found ? WEEKDAYS.indexOf(found.slice(0, 3)) : null;
}
// Typed fast, "7mp" or "7 p.m." still means 7pm, and "to 7" after "from 8pm" means 7pm too.
function tidyClocks(said) {
  return said.replace(/\b(\d{1,2}(?::\d{2})?)\s*(?:pm|mp|p\.m\.?|p)\b/g, "$1pm")
    .replace(/\b(\d{1,2}(?::\d{2})?)\s*(?:am|ma|a\.m\.?|a)\b/g, "$1am");
}
function seriesIn(said, named) {
  if (!MOVING.test(said) || !SERIES.test(said) || !named.length) return [];
  said = tidyClocks(said);
  const times = [...said.matchAll(CLOCK)].map((m) => ({ at: m.index, time: readTime(m[0]) })).filter((t) => t.time);
  const goal = said.match(/\bto\s+(\d{1,2}(?::\d{2})?(?:am|pm)?|noon)\b/);
  if (!goal) return [];
  const to = goal.index;
  const from = times.filter((t) => t.at < to).pop()?.time ?? null;
  // A bare "to 7" takes the half of the day from the time it's moving from.
  let time = readTime(goal[1]);
  if (time && from && !/am|pm|noon/.test(goal[1])) {
    const [hours, minutes] = goal[1].split(":").map(Number);
    time = hours > 12 ? time : [from[0] >= 12 && hours < 12 ? hours + 12 : hours % 24, minutes || 0];
  }
  const target = { time };
  if (!target.time) return [];
  const weekday = weekdayIn(said);
  const fits = named.filter((e) => {
    const d = new Date(e.start);
    return (weekday === null || d.getDay() === weekday) && (!from || (d.getHours() === from[0] && d.getMinutes() === from[1]));
  });
  const titles = [...new Set((fits.length ? fits : named).map((e) => e.title))];
  return titles.map((title) => ({ title, weekday, from, to: target.time }));
}

// Everything the model says is checked here, so a bad answer can't put nonsense on the board.
function toResult(kind, reply, { now, events, tasks, categories = [] }, text) {
  if (kind === "chat" && ASKING.test(text)) return { answer: reply.reply || "I couldn't work that out." };
  const said = text.toLowerCase();
  // A small model can put a task entry in the wrong list, so each goes where its fields say:
  // a ref and a category is sorting, a ref and a day or time is a new due date.
  const entries = [reply.tasks, reply.add_tasks, reply.sort_tasks, reply.redate_tasks]
    .flatMap((list) => (Array.isArray(list) ? list : [])).filter((e) => e && typeof e === "object");
  const sorting = entries.filter((e) => e.ref && e.category);
  const redating = entries.filter((e) => e.ref && !e.category && (e.day || e.time));
  const adding = entries.filter((e) => !e.ref && e.title);
  const known = new Set(tasks.map((t) => simple(t.title)));
  let newTasks = adding.filter((t) => t.title?.trim() && !known.has(simple(t.title)))
    .map((t) => ({ title: t.title.trim(), due: moment(saidDay(t.day, said, now), saidTime(t.time, said), now, END_OF_DAY), detail: t.detail ?? "" }));
  if (kind === "assignments") {
    return { tasks: newTasks, answer: newTasks.length ? "" : "I didn't find anything new to add." };
  }

  // Two events can share a name, so a day in the message settles which is meant.
  const days = daysIn(said, now);
  const onThatDay = namedEvents(events, said).filter((e) => days.has(new Date(e.start).setHours(0, 0, 0, 0)));
  const named = onThatDay.length ? onThatDay : namedEvents(events, said);
  let unsure = false;
  // The model's pick stands only if the message names that event. With one match, that's it.
  const pick = (ref) => {
    const chosen = events[Number(String(ref).replace(/\D/g, "")) - 1];
    const found = named.includes(chosen) ? chosen : named.length === 1 ? named[0] : null;
    if (!found) unsure = true;
    return found;
  };
  // Event entries go where their fields say too: one with a ref is a move, wherever it's put.
  const eventEntries = [reply.add_events, reply.move_events]
    .flatMap((list) => (Array.isArray(list) ? list : [])).filter((e) => e && typeof e === "object");
  const moving = eventEntries.filter((e) => e.ref && (e.day || e.time));
  // A new event with no name is named from the message: "for studying" gives Studying.
  const forWhat = text.match(/\bfor\s+([a-z][\w\s'-]{1,40}?)\s*[.!]?$/i)?.[1];
  const nameless = forWhat ? forWhat[0].toUpperCase() + forWhat.slice(1) : "Busy";
  let add = eventEntries.filter((e) => !e.ref && (e.title || e.start)).flatMap((e) => {
    const start = moment(saidDay(e.day, said, now), e.start, now);
    if (!start) return [];
    const title = e.title?.trim() || nameless;
    return [{ title, place: e.place ?? "", start, end: moment(e.day, e.end, now) ?? start + 3600000 }];
  });
  // "Lunch with Sam at Dallas BBQ" can come back as a task called Lunch with Sam plus an event
  // called Dallas BBQ. An event named only after its place takes the task's name instead.
  const merged = new Set();
  add = add.map((e) => {
    if (!e.place || simple(e.title) !== simple(e.place)) return e;
    const task = newTasks.find((t) => !merged.has(simple(t.title)));
    if (!task) return e;
    merged.add(simple(task.title));
    return { ...e, title: task.title };
  });
  newTasks = newTasks.filter((t) => !merged.has(simple(t.title)));
  let move = moving.flatMap((m) => {
    const found = pick(m.ref);
    if (!found) return [];
    // "Move it to 6pm" with no day stays on the same day.
    const day = readDay(saidDay(m.day, said, now), now) ?? new Date(found.start);
    const start = moment(day, m.time, now);
    return start ? [{ id: found.id, start, end: start + (found.end - found.start) }] : [];
  });
  if (MOVING.test(said)) {
    // Asked to move something, a model may add a copy instead of moving the original...
    if (!move.length && add.length === 1 && named.length === 1) {
      const [{ start }] = add;
      move.push({ id: named[0].id, start, end: start + (named[0].end - named[0].start) });
    }
    // ...or add a copy as well as moving it. Either way the copy is dropped.
    const moving = new Set(move.map((m) => simple(events.find((e) => e.id === m.id)?.title ?? "")));
    named.forEach((e) => moving.add(simple(e.title)));
    add = add.filter((a) => !moving.has(simple(a.title)) && !(add.length === 1 && named.length === 1 && move.length));
  }
  // "Move all my Math Classes to 7pm" moves every one the message names to that time of day.
  if (ALL.test(said) && move.length && named.length > 1) {
    const to = new Date(move[0].start);
    move = named.map((e) => {
      const start = new Date(e.start).setHours(to.getHours(), to.getMinutes(), 0, 0);
      return { id: e.id, start, end: start + (e.end - e.start) };
    });
  }
  move = move.filter((m, i) => move.findIndex((o) => o.id === m.id) === i);
  // A repeating change covers this week's one too, so its single moves aren't needed.
  const series = seriesIn(said, named);
  if (series.length) {
    const covered = new Set(series.map((s) => simple(s.title)));
    move = move.filter((m) => !covered.has(simple(events.find((e) => e.id === m.id)?.title ?? "")));
  }
  // Something being moved isn't also being removed.
  // A bare event ref left in the wrong list is a removal when the message cancels something.
  const stray = [reply.add_events, reply.move_events].flatMap((list) => (Array.isArray(list) ? list : []))
    .filter((e) => typeof e === "string");
  const removing = [...(Array.isArray(reply.remove_events) ? reply.remove_events : []), ...(CANCELLING.test(said) ? stray : [])];
  const hide = [...new Set(removing.map((ref) => pick(typeof ref === "object" ? ref?.ref : ref)?.id).filter(Boolean))]
    .filter((id) => !move.some((m) => m.id === id))
    // ...and nor is a class a repeating change is moving, unless the message also cancels one.
    .filter((id) => !(series.length && !CANCELLING.test(said)
      && series.some((s) => simple(s.title) === simple(events.find((e) => e.id === id)?.title ?? ""))));

  // Tasks get the same care as events: only ones the message names can change.
  const listed = tasks.slice(0, MOST_TASKS_LISTED);
  const namedT = namedTasks(listed, said);
  let unsureTask = false;
  const pickTask = (ref) => {
    const chosen = listed[Number(String(ref).replace(/\D/g, "")) - 1];
    const found = namedT.includes(chosen) ? chosen : namedT.length === 1 ? namedT[0] : null;
    if (!found) unsureTask = true;
    return found;
  };
  const everyNamed = ALL.test(said);
  let sort = sorting.flatMap((s) => {
    const task = pickTask(s.ref);
    const category = categoryFor(s.category, categories, said);
    return task && category ? [{ id: task.id, category }] : [];
  });
  if (everyNamed && sort.length && new Set(sort.map((s) => s.category)).size === 1) {
    sort = namedT.map((t) => ({ id: t.id, category: sort[0].category }));
  }
  sort = sort.filter((s, i) => sort.findIndex((o) => o.id === s.id) === i);
  const redate = redating.flatMap((r) => {
    const task = pickTask(r.ref);
    const day = saidDay(r.day, said, now);
    const time = saidTime(r.time, said);
    if (!task || (!day && !time)) return [];
    // A new day keeps the time it was due, and a new time keeps the day.
    const was = task.due ? new Date(task.due) : null;
    const on = readDay(day, now) ?? was;
    const due = on && moment(on, time, now, was ? [was.getHours(), was.getMinutes()] : END_OF_DAY);
    return due ? [{ id: task.id, due }] : [];
  });
  const finishing = (Array.isArray(reply.finish_tasks) ? reply.finish_tasks : []).map((f) => (typeof f === "object" ? f?.ref : f));
  let finish = [...new Set(finishing.filter(Boolean).map((ref) => pickTask(ref)?.id).filter(Boolean))];
  if (everyNamed && finish.length) finish = namedT.map((t) => t.id);

  const changing = newTasks.length + add.length + move.length + hide.length + sort.length + redate.length + finish.length + series.length > 0;
  if ((unsure || unsureTask) && !changing) {
    return { answer: `I couldn't tell which ${unsureTask && !unsure ? "task" : "event"} you meant, so I didn't change anything.` };
  }
  if (changing) return { answer: "", tasks: newTasks, add, move, hide, sort, redate, finish, series };
  // A model can say "Added." without adding anything, and that mustn't look like it worked.
  const claimed = /^(added|moved|removed|cancell?ed|done|skipped|deleted)\b/i.test((reply.reply ?? "").trim());
  return { answer: claimed || !reply.reply ? "I wasn't sure what to change, so I left everything as it is." : reply.reply };
}

// `options` can hold Ollama settings, like { num_gpu: 0, num_thread: 4 } to act like a Pi.
export function ollamaProvider({ url = "http://127.0.0.1:11434", model, think = false, options = {}, onStats = () => {} }) {
  async function ask(kind, system, text, temperature) {
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think,
        format: SCHEMA[kind],
        options: { temperature, num_ctx: CONTEXT_SIZE, ...options },
        messages: [{ role: "system", content: system }, { role: "user", content: text }],
      }),
    });
    if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const body = await response.json();
    onStats(body);
    // AI_DEBUG=1 prints what the model said, to see why an answer went wrong.
    if (process.env.AI_DEBUG) console.error(`[${kind}] ${body.message.content}`);
    return readJson(body.message.content, kind);
  }

  async function run(kind, text, context) {
    const system = kind === "assignments" ? assignmentPrompt(context) : chatPrompt(context, context.history ?? []);
    // A garbled answer gets one more try, a little looser so it doesn't repeat itself exactly.
    const reply = await ask(kind, system, text, 0).catch((error) => {
      if (error.message.startsWith("Ollama")) throw error;
      return ask(kind, system, text, .3);
    });
    return toResult(kind, reply, context, text);
  }

  const changes = (r) => ["tasks", "add", "move", "hide", "sort", "redate", "finish", "series"].some((k) => r[k]?.length);

  return async (text, context) => {
    const kind = context.kind === "assignments" ? "assignments" : "chat";
    const result = await run(kind, text, context);
    // A short instruction sent as an assignment, like "put the AHS posts under Film", finds
    // nothing to add, so it's tried as a change to the schedule instead.
    // It only changes what's already there, so an assignment the model missed can't come back
    // as an event instead.
    if (kind === "assignments" && !changes(result) && text.length < 300) {
      const { tasks, add, ...asChange } = await run("chat", text, context);
      if (changes(asChange)) return asChange;
    }
    return result;
  };
}
