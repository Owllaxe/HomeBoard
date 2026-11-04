// The AI box. Nothing is connected yet: messages sent from the phone page wait in the chat,
// and the board hides Add or ask, until a model is plugged in here.
//
// To connect a model, call setProvider() in server.mjs with an async function:
//
//   async function provider(text, context) { ... }
//
// `text` is what was typed. `context` holds { now, kind, events, tasks, categories, places, history }.
// `kind` is "assignments" for pasted descriptions and "chat" for everything else, and
// `history` is the conversation so far, so "move that one too" can make sense.
// It returns any of these, and everything it returns is applied to the board:
//
//   { answer: "Your longest free stretch is Sunday afternoon." }  shown in the chat
//   { tasks: [{ title: "Dynamics quiz 4", due: <ms since 1970> or null, detail: "Gradescope" }] }
//   { places: [{ name: "Mechanics", place: "Science Center" }] }     teaches a vague location
//   { add: [{ title, place, start, end }] }                       a new event, times in ms
//   { move: [{ id, start, end }] }                                an event from context.events
//   { hide: [id] }                                                takes an event off the board
//   { sort: [{ id, category }] }                                  a task from context.tasks into a category
//   { redate: [{ id, due }] }                                     a task's new due time, in ms
//   { finish: [id] }                                              marks a task done
//   { series: [{ title, weekday, from, to }] }                    every matching event from today on:
//       weekday 0-6 or null for any day, and from and to as [hours, minutes], from null for any time
//
// A Google Calendar link can only be read, so add, move and hide change the board and not
// Google Calendar. A request can take minutes on a Pi, so requests run one at a time.
import { randomUUID } from "node:crypto";

let provider = null;
const jobs = new Map();
const KEEP = 60 * 60 * 1000;

export const setProvider = (fn) => { provider = fn; };
export const aiAvailable = () => provider !== null;
export const askProvider = (text, context) => provider(text, context);

export function startJob(text, context, apply) {
  const id = randomUUID();
  const job = { status: "working", started: Date.now() };
  jobs.set(id, job);
  provider(text, context)
    .then((result) => {
      Object.assign(job, { status: "done", ...apply(result ?? {}) });
    })
    .catch((error) => {
      Object.assign(job, { status: "failed", error: error.message });
    });
  for (const [key, old] of jobs) if (Date.now() - old.started > KEEP) jobs.delete(key);
  return id;
}

export const getJob = (id) => jobs.get(id);
