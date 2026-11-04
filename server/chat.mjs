// The conversation from the phone page. Every message is saved first, so anything sent before
// the AI is connected simply waits its turn, and they run one at a time because a Pi is slow.
import { randomUUID } from "node:crypto";
import { aiAvailable, askProvider } from "./ai.mjs";

const MOST_MESSAGES = 200;
const MOST_LENGTH = 20000;

export function createChat({ store, contextFor, applyResult }) {
  const { data } = store;
  data.chat ??= [];
  // Anything cut off by a restart goes back in the queue.
  data.chat.filter((m) => m.status === "working").forEach((m) => { m.status = "waiting"; });
  let busy = false;

  function reply(text) {
    data.chat.push({ id: randomUUID(), from: "board", text, at: Date.now() });
    data.chat.splice(0, Math.max(0, data.chat.length - MOST_MESSAGES));
  }

  async function next() {
    if (busy || !aiAvailable()) return;
    const message = data.chat.find((m) => m.status === "waiting");
    if (!message) return;
    busy = true;
    message.status = "working";
    store.save();
    try {
      const history = data.chat.filter((m) => m !== message).map(({ from, text }) => ({ from, text }));
      const result = await askProvider(message.text, { ...contextFor(), kind: message.kind, history });
      reply(applyResult(result ?? {}).summary);
      message.status = "done";
    } catch (error) {
      message.status = "failed";
      message.error = error.message;
    }
    busy = false;
    store.save();
    next();
  }

  return {
    next,
    add(text, kind) {
      const body = String(text ?? "").trim();
      if (!body) throw new Error("There's nothing to send");
      const message = {
        id: randomUUID(), from: "you", text: body.slice(0, MOST_LENGTH),
        kind: kind === "assignments" ? "assignments" : "chat", status: "waiting", at: Date.now(),
      };
      data.chat.push(message);
      store.save();
      next();
      return message;
    },
    retry(id) {
      const message = data.chat.find((m) => m.id === id && m.status === "failed");
      if (!message) throw new Error("That message can't be sent again");
      message.status = "waiting";
      store.save();
      next();
    },
    view: () => ({ messages: data.chat, ai: { available: aiAvailable() } }),
  };
}
