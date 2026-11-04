// Tests a model on the whole path: a message goes in through the real chat, and the check looks
// at what ended up on the board. It uses a throwaway board, so real data is never touched.
//   node tools/test-ai.mjs <model>         as fast as this machine can go
//   node tools/test-ai.mjs <model> --pi    CPU only on 4 threads, closer to a Raspberry Pi
//   add --think to let the model reason first, which is slower
//   add --only=<word> to run just the tests with that word in their name
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setProvider } from "../server/ai.mjs";
import { createApp } from "../server/app.mjs";
import { ollamaProvider } from "../server/ollama.mjs";
import { createSources } from "../server/sources.mjs";
import { openStore } from "../server/store.mjs";

const model = process.argv[2];
if (!model) {
  console.log("Usage: node tools/test-ai.mjs <model> [--pi] [--only=word]");
  process.exit(1);
}
const asPi = process.argv.includes("--pi");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const LIMIT = 10 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The next time this weekday comes round, never today, so "Thursday" has one meaning.
function next(name, hour = 0, minute = 0) {
  const d = new Date();
  const ahead = (dayNames.indexOf(name) - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const event = (uid, start, minutes, title, place) => ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20260101T000000Z",
  `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + minutes * 60000))}`, `SUMMARY:${title}`,
  `LOCATION:${place}`, "END:VEVENT"].join("\r\n");
const calendar = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${[
  event("e1", next("Monday", 12), 110, "Art History Survey", "Lab Annex"),
  event("e2", next("Tuesday", 14), 80, "Mechanics - Lecture", "Science Center"),
  event("e3", next("Tuesday", 16), 110, "Linear Algebra", "Science Center"),
  event("e4", next("Wednesday", 20), 120, "Math Class", "Online"),
  event("e5", next("Thursday", 16), 110, "Linear Algebra", "Science Center"),
  event("e6", next("Friday", 16), 55, "Mechanics - Recitation", "Math Building"),
].join("\r\n")}\r\nEND:VCALENDAR\r\n`;

const same = (ms, d) => Math.abs(ms - d.getTime()) < 60000;
const sameDay = (ms, d) => ms && new Date(ms).toDateString() === d.toDateString();
const task = (b, word) => b.tasks.find((t) => t.title.toLowerCase().includes(word));
const events = (b, word) => b.events.filter((e) => e.title.toLowerCase().includes(word));
const unchanged = (b) => b.events.length === 6 && b.tasks.length === 1;
const startDays = (b) => b.events.map((e) => e.start).sort().join();
let untouched;

const check = (pairs) => pairs.filter(([, ok]) => !ok).map(([what]) => what);
const byId = (b, id) => b.tasks.find((t) => t.id === id);
const WEEK = 7 * 86400000;
// Extra tasks and a category for the tests that organize what's already there.
const organizing = {
  tasks: [
    { id: "task/ahs8", title: "AHS Post 08", due: next("Monday", 23, 59).getTime(), detail: "" },
    { id: "task/ahs9", title: "AHS Post 09", due: next("Monday", 23, 59).getTime() + WEEK, detail: "" },
    { id: "task/video", title: "Video Project #1", due: next("Monday", 23, 59).getTime(), detail: "" },
  ],
  categories: [{ name: "Art History Survey", color: "#E8A33D" }],
};
const novemberNext = (day, hour = 23, minute = 59) => {
  const d = new Date();
  const year = d.getMonth() > 10 || (d.getMonth() === 10 && d.getDate() > day) ? d.getFullYear() + 1 : d.getFullYear();
  return new Date(year, 10, day, hour, minute);
};

const tests = [
  ["assignment: one line", "assignments", "Dynamics quiz 4 is Thursday at 9:30 on Gradescope", (b) => check([
    ["added the quiz", task(b, "quiz")],
    ["due Thursday 9:30", task(b, "quiz") && same(task(b, "quiz").due, next("Thursday", 9, 30))],
    ["adds only that", b.tasks.length === 2],
    ["schedule untouched", startDays(b) === untouched],
  ])],
  ["assignment: messy list", "assignments", "hw 5 due fri 11:59pm webassign\nlab report nov 12\nread ch 7", (b) => check([
    ["added hw 5", task(b, "hw 5") || task(b, "hw5")],
    ["hw due Friday", sameDay((task(b, "hw 5") ?? task(b, "hw5"))?.due, next("Friday"))],
    ["added lab report", task(b, "lab report")],
    ["lab due Nov 12", sameDay(task(b, "lab report")?.due, novemberNext(12))],
    ["reading has no invented date", !task(b, "read") || !task(b, "read").due],
  ])],
  ["assignment: from a syllabus", "assignments", "Project 2 proposals must be submitted through Brightspace by 5pm on November 20. Late work will not be accepted, and please cite your sources.", (b) => check([
    ["added the proposal", task(b, "proposal")],
    ["due Nov 20 at 5pm", task(b, "proposal") && same(task(b, "proposal").due, novemberNext(20, 17, 0))],
    ["no task from the rules", b.tasks.length === 2],
  ])],
  ["assignment: skips what's there", "assignments", "Statics HW 7 is due soon. New this week: Fluids prelab due Monday at noon", (b) => check([
    ["added the prelab", task(b, "prelab")],
    ["no duplicate Statics", b.tasks.filter((t) => t.title.toLowerCase().includes("statics")).length === 1],
    ["due Monday noon", task(b, "prelab") && same(task(b, "prelab").due, next("Monday", 12))],
  ])],
  ["schedule: move an event", "chat", "Move Mechanics recitation to Thursday at 6pm", (b) => check([
    ["moved to Thursday 6pm", events(b, "recitation")[0] && same(events(b, "recitation")[0].start, next("Thursday", 18))],
    ["kept its length", events(b, "recitation")[0]?.end - events(b, "recitation")[0]?.start === 55 * 60000],
    ["six events still", b.events.length === 6],
    ["others unmoved", events(b, "linear").some((e) => same(e.start, next("Tuesday", 16)))],
  ])],
  ["schedule: remove one of two", "chat", "I'm skipping Thursday's Linear Algebra", (b) => check([
    ["Thursday one gone", !events(b, "linear").some((e) => sameDay(e.start, next("Thursday")))],
    ["Tuesday one kept", events(b, "linear").some((e) => sameDay(e.start, next("Tuesday")))],
    ["only that removed", b.events.length === 5],
  ])],
  ["schedule: add an event", "chat", "Add gym on Wednesday from 7 to 8am", (b) => check([
    ["added gym", events(b, "gym")[0]],
    ["Wednesday 7am", events(b, "gym")[0] && same(events(b, "gym")[0].start, next("Wednesday", 7))],
    ["ends 8am", events(b, "gym")[0] && same(events(b, "gym")[0].end, next("Wednesday", 8))],
    ["nothing else changed", b.events.length === 7 && b.tasks.length === 1],
  ])],
  ["schedule: two things at once", "chat", "Cancel Math Class and add office hours on Friday at 2pm", (b) => check([
    ["Math Class gone", !events(b, "math class").length],
    ["office hours added", events(b, "office")[0]],
    ["Friday 2pm", events(b, "office")[0] && same(events(b, "office")[0].start, next("Friday", 14))],
  ])],
  ["task from chat", "chat", "Remind me to email Prof Rao by Tuesday", (b) => check([
    ["added a task", task(b, "rao")],
    ["due Tuesday", sameDay(task(b, "rao")?.due, next("Tuesday"))],
    ["schedule untouched", startDays(b) === untouched],
  ])],
  ["question: what's on a day", "chat", "What do I have on Tuesday?", (b, reply) => check([
    ["names the lecture", /mechanics/i.test(reply)],
    ["names Linear Algebra", /linear/i.test(reply)],
    ["doesn't invent Friday's", !/recitation/i.test(reply)],
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],
  ["question: changes nothing", "chat", "When is my next Mechanics lecture?", (b, reply) => check([
    ["says Tuesday", /tue/i.test(reply)],
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],
  ["ignores small talk", "chat", "thanks, that's all for now", (b) => check([
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],

  // Kept apart from the prompts: don't tune against these, or the score stops meaning anything.
  ["unseen: assignment with a slash date", "assignments", "PH 1013 problem set 9 - due 11/14 by 10pm via Gradescope", (b) => check([
    ["added it", task(b, "problem set") || task(b, "ps 9") || task(b, "pset")],
    ["due Nov 14 at 10pm", same((task(b, "problem set") ?? task(b, "ps 9") ?? task(b, "pset"))?.due, novemberNext(14, 22, 0))],
  ])],
  ["unseen: two in a sentence", "assignments", "Midterm 2 is on Nov 18 in class. Also a reading response is due tomorrow.", (b) => check([
    ["added the midterm", task(b, "midterm")],
    ["midterm Nov 18", sameDay(task(b, "midterm")?.due, novemberNext(18))],
    ["added the reading", task(b, "reading")],
    ["reading due tomorrow", sameDay(task(b, "reading")?.due, new Date(Date.now() + 86400000))],
  ])],
  ["unseen: nothing to hand in", "assignments", "Office hours moved to room 204 this week. Bring questions.", (b) => check([
    ["adds nothing", b.tasks.length === 1],
  ])],
  ["unseen: new time, same day", "chat", "Push Math Class back to 9pm", (b) => check([
    ["Wednesday at 9pm", events(b, "math class")[0] && same(events(b, "math class")[0].start, next("Wednesday", 21))],
    ["six events still", b.events.length === 6],
  ])],
  ["unseen: cancel by name", "chat", "Cancel my Mechanics lecture", (b) => check([
    ["lecture gone", !events(b, "lecture").length],
    ["recitation kept", events(b, "recitation").length === 1],
    ["only that removed", b.events.length === 5],
  ])],
  ["unseen: event with a place", "chat", "Put lunch with Sam on Tuesday at noon at Dallas BBQ", (b) => check([
    ["added lunch", events(b, "lunch")[0]],
    ["Tuesday noon", events(b, "lunch")[0] && same(events(b, "lunch")[0].start, next("Tuesday", 12))],
    ["kept the place", /dallas/i.test(events(b, "lunch")[0]?.place ?? "")],
  ])],
  ["unseen: task with no date", "chat", "I need to buy a lab notebook", (b) => check([
    ["added a task", task(b, "notebook")],
    ["no invented date", task(b, "notebook") && !task(b, "notebook").due],
    ["schedule untouched", startDays(b) === untouched],
  ])],
  ["unseen: polite request", "chat", "Can you move Tuesday's Linear Algebra to 5pm?", (b) => check([
    ["Tuesday one moved", events(b, "linear").some((e) => same(e.start, next("Tuesday", 17)))],
    ["Thursday one kept", events(b, "linear").some((e) => same(e.start, next("Thursday", 16)))],
  ])],
  ["unseen: nothing that day", "chat", "Do I have anything on Saturday?", (b, reply) => check([
    ["says nothing's on", /\b(no|nothing|free|don't|do not|not)\b/i.test(reply)],
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],
  ["unseen: which class", "chat", "Where's my Friday class?", (b, reply) => check([
    ["names recitation", /recitation/i.test(reply)],
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],

  // A second untouched set, added after the first one had been read.
  ["final: exam with a room", "assignments", "Linear algebra exam 2 will be held Wednesday at 4:00 PM in North Hall 202.", (b) => check([
    ["added the exam", task(b, "exam")],
    ["due Wednesday 4pm", task(b, "exam") && same(task(b, "exam").due, next("Wednesday", 16))],
  ])],
  ["final: long messy paste", "assignments", "Week 10 reminders!! pset 8 due Tuesday 11:59pm on webassign. Quiz on chapter 6 friday in recitation. Remember to check your grades.", (b) => check([
    ["added the pset", task(b, "pset") || task(b, "problem")],
    ["pset due Tuesday", sameDay((task(b, "pset") ?? task(b, "problem"))?.due, next("Tuesday"))],
    ["added the quiz", task(b, "quiz")],
    ["quiz Friday", sameDay(task(b, "quiz")?.due, next("Friday"))],
    ["just those two", b.tasks.length === 3],
  ])],
  ["final: drop a class by day", "chat", "No Mechanics recitation this Friday, take it off", (b) => check([
    ["recitation gone", !events(b, "recitation").length],
    ["lecture kept", events(b, "lecture").length === 1],
    ["only that removed", b.events.length === 5],
  ])],
  ["final: move to a morning", "chat", "Move Art History Survey to Friday at 10am", (b) => check([
    ["Friday 10am", events(b, "art history")[0] && same(events(b, "art history")[0].start, next("Friday", 10))],
    ["six events still", b.events.length === 6],
  ])],
  ["final: study session", "chat", "Block off 3 to 5pm on Thursday for studying", (b) => check([
    ["added it", events(b, "stud")[0]],
    ["Thursday 3pm", events(b, "stud")[0] && same(events(b, "stud")[0].start, next("Thursday", 15))],
    ["ends 5pm", events(b, "stud")[0] && same(events(b, "stud")[0].end, next("Thursday", 17))],
  ])],
  ["final: a chore", "chat", "Don't let me forget to pay rent by Friday", (b) => check([
    ["added a task", task(b, "rent")],
    ["due Friday", sameDay(task(b, "rent")?.due, next("Friday"))],
    ["schedule untouched", startDays(b) === untouched],
  ])],
  ["final: vague, must not guess", "chat", "Cancel my class", (b, reply) => check([
    ["removes nothing", b.events.length === 6],
    ["says so", reply.length > 0],
  ])],
  ["final: asks about the day", "chat", "What time does Linear Algebra start on Thursday?", (b, reply) => check([
    ["says 4", /\b(4|16)(:00)?\b/.test(reply)],
    ["changes nothing", unchanged(b) && startDays(b) === untouched],
  ])],

  // A real message that once added a copy as well as moving the class.
  ["real: move without a copy", "chat", "move all of my math classes that are currently on wednesdays 8pm to 7pm starting this week.", (b) => check([
    ["Wednesday at 7pm", events(b, "math class")[0] && same(events(b, "math class")[0].start, next("Wednesday", 19))],
    ["no copy added", b.events.length === 6],
  ])],

  ["real: repeat in future weeks", "chat", "move all 8pm math classes in future weeks to 7pm. do not change the past ones.", (b) => check([
    ["this week's at 7pm", events(b, "math class").some((e) => same(e.start, next("Wednesday", 19)))],
    ["two weeks out at 7pm", events(b, "math class").some((e) => same(e.start, new Date(next("Wednesday", 19).getTime() + 2 * WEEK)))],
    ["none left at 8pm", !events(b, "math class").some((e) => new Date(e.start).getHours() === 20)],
    ["no copy added", b.events.length === 7],
  ]), { more: true }],
  ["real: repeat with a typo", "chat", "move all future math classes on wednesdays from 8pm to 7mp. dont change the ones that already happend", (b) => check([
    ["this week's at 7pm", events(b, "math class").some((e) => same(e.start, next("Wednesday", 19)))],
    ["two weeks out at 7pm", events(b, "math class").some((e) => same(e.start, new Date(next("Wednesday", 19).getTime() + 2 * WEEK)))],
    ["none left at 8pm", !events(b, "math class").some((e) => new Date(e.start).getHours() === 20)],
  ]), { more: true }],
  ["real: repeat to a bare hour", "chat", "every wednesday math class from 8pm should move to 7 from now on", (b) => check([
    ["two weeks out at 7pm", events(b, "math class").some((e) => same(e.start, new Date(next("Wednesday", 19).getTime() + 2 * WEEK)))],
    ["none left at 8pm", !events(b, "math class").some((e) => new Date(e.start).getHours() === 20)],
  ]), { more: true }],

  // Organizing tasks that are already there. These start with three more tasks and a category.
  ["tasks: sort a group", "chat", "Move all of the AHS posts into the Art History category", (b) => check([
    ["post 08 sorted", byId(b, "task/ahs8")?.category === "Art History Survey"],
    ["post 09 sorted", byId(b, "task/ahs9")?.category === "Art History Survey"],
    ["video left alone", !byId(b, "task/video")?.category],
    ["nothing added", b.tasks.length === 4],
  ]), organizing],
  ["tasks: new category", "chat", "Put Video Project #1 in a new category called Film", (b) => check([
    ["video in Film", byId(b, "task/video")?.category === "Film"],
    ["posts left alone", !byId(b, "task/ahs8")?.category && !byId(b, "task/ahs9")?.category],
  ]), organizing],
  ["tasks: new due date", "chat", "AHS Post 09 is now due Friday", (b) => check([
    ["due Friday", same(byId(b, "task/ahs9")?.due, next("Friday", 23, 59))],
    ["post 08 unchanged", same(byId(b, "task/ahs8")?.due, next("Monday", 23, 59))],
  ]), organizing],
  ["tasks: finish one", "chat", "I finished AHS Post 08", (b) => check([
    ["post 08 done", !byId(b, "task/ahs8")],
    ["post 09 still there", !!byId(b, "task/ahs9")],
    ["schedule untouched", startDays(b) === untouched],
  ]), organizing],
  ["tasks: sent as an assignment", "assignments", "move all of the ahs post assigments into art history catagory", (b) => check([
    ["both posts sorted", ["task/ahs8", "task/ahs9"].every((id) => byId(b, id)?.category === "Art History Survey")],
    ["nothing added", b.tasks.length === 4],
  ]), organizing],
  ["tasks: question changes nothing", "chat", "When is AHS Post 09 due?", (b) => check([
    ["changes nothing", b.tasks.length === 4 && !b.tasks.some((t) => t.category) && same(byId(b, "task/ahs9")?.due, new Date(next("Monday", 23, 59).getTime() + WEEK))],
  ]), organizing],
];

// "?more" adds the same Math Class two weeks later, beyond the 8 days the AI is shown.
const later = event("e7", new Date(next("Wednesday", 20).getTime() + 2 * WEEK), 120, "Math Class", "Online");
const feed = createServer((q, r) => {
  r.writeHead(200, { "content-type": "text/calendar" });
  r.end(q.url.includes("more") ? calendar.replace("END:VCALENDAR", `${later}
END:VCALENDAR`) : calendar);
});
await new Promise((ok) => { feed.listen(0, "127.0.0.1", ok); });
const link = `http://127.0.0.1:${feed.address().port}/c.ics`;

let stats = {};
const options = asPi ? { num_gpu: 0, num_thread: 4 } : {};
const think = process.argv.includes("--think");
setProvider(ollamaProvider({ model, think, options, onStats: (s) => { stats = s; } }));

async function run([name, kind, text, verify, setup = {}]) {
  const store = openStore(mkdtempSync(join(tmpdir(), "board-ai-")));
  store.data.links.calendar = setup.more ? `${link}?more` : link;
  store.data.tasks.push({ id: "task/statics", title: "Statics HW 7", due: next("Sunday", 23, 59).getTime(), detail: "" });
  store.data.tasks.push(...(setup.tasks ?? []));
  store.data.categories = [...(setup.categories ?? [])];
  const sources = createSources(store);
  await sources.refreshAll();
  const app = createApp({ root: "public", store, sources });
  await new Promise((ok) => { app.listen(0, "127.0.0.1", ok); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const get = async (path) => (await fetch(base + path)).json();
  untouched = startDays(await get("/api/board"));

  const began = Date.now();
  await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, kind }) });
  let messages;
  do {
    await new Promise((ok) => { setTimeout(ok, 100); });
    ({ messages } = await get("/api/chat"));
  } while (messages[0].status !== "done" && messages[0].status !== "failed" && Date.now() - began < LIMIT);
  const seconds = (Date.now() - began) / 1000;
  const reply = messages[1]?.text ?? "";
  const board = await get("/api/board");
  app.close();
  const failed = messages[0].status === "done" ? verify(board, reply) : [`request ${messages[0].status}: ${messages[0].error ?? ""}`];
  return { name, failed, seconds, reply, tokens: stats.eval_count ?? 0, promptTokens: stats.prompt_eval_count ?? 0, evalMs: (stats.eval_duration ?? 0) / 1e6, board };
}

console.log(`${model}${asPi ? ", CPU only on 4 threads" : ""}\n`);
const chosen = tests.filter(([name]) => !only || name.includes(only));
const results = [];
for (const test of chosen) {
  const result = await run(test);
  results.push(result);
  console.log(`${result.failed.length ? "FAIL" : "pass"}  ${result.seconds.toFixed(1).padStart(6)}s  ${result.name}`);
  if (result.failed.length) {
    console.log(`        wrong: ${result.failed.join("; ")}`);
    console.log(`        reply: ${result.reply.slice(0, 120)}`);
    console.log(`        tasks: ${result.board.tasks.map((t) => `${t.title} @ ${t.due ? new Date(t.due).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no date"}`).join(" | ")}`);
    console.log(`        events: ${result.board.events.map((e) => `${e.title} @ ${new Date(e.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`).join(" | ")}`);
  }
}
const passed = results.filter((r) => !r.failed.length).length;
const tokens = results.reduce((s, r) => s + r.tokens, 0);
const ms = results.reduce((s, r) => s + r.evalMs, 0);
const times = results.map((r) => r.seconds);
const score = (prefix) => {
  const set = results.filter((r) => r.name.startsWith(prefix));
  return `${set.filter((r) => !r.failed.length).length} of ${set.length}`;
};
console.log(`\n${passed} of ${results.length} passed. First unseen set ${score("unseen")}, final unseen set ${score("final")}, organizing tasks ${score("tasks")}`);
console.log(`Typical request ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(1)}s, slowest ${Math.max(...times).toFixed(1)}s, ${(tokens / (ms / 1000)).toFixed(1)} tokens/s, prompt about ${Math.max(...results.map((r) => r.promptTokens))} tokens`);
feed.close();
process.exit(0);
