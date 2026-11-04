// Starts the board, reachable from phones and laptops on your Wi-Fi, which need the code
// from the board's menu. HOST=127.0.0.1 keeps it to this machine alone. PORT and BOARD_DATA
// change where it listens and where it keeps its data. OLLAMA_MODEL turns the AI on, and
// OLLAMA_URL says where Ollama is if it isn't on this machine.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { setProvider } from "./server/ai.mjs";
import { createApp } from "./server/app.mjs";
import { ollamaProvider } from "./server/ollama.mjs";
import { createSources } from "./server/sources.mjs";
import { openStore } from "./server/store.mjs";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const store = openStore(process.env.BOARD_DATA ?? join(import.meta.dirname, "data"));
const sources = createSources(store);
if (process.env.OLLAMA_MODEL) {
  setProvider(ollamaProvider({ model: process.env.OLLAMA_MODEL, url: process.env.OLLAMA_URL }));
}

// Doesn't wait for the calendar, so the board comes up straight away with no internet.
sources.refreshAll();
createApp({ root: join(import.meta.dirname, "public"), store, sources })
  .listen(port, host, () => console.log(`Board at http://127.0.0.1:${port}/`));

// Run as a service (systemd sets INVOCATION_ID), the server stops itself once its own code has
// been updated, and the service starts it again straight away with the new code. It waits until
// the files stop changing, so a copy still in progress isn't picked up halfway.
if (process.env.INVOCATION_ID) {
  const code = [join(import.meta.dirname, "server.mjs"),
    ...readdirSync(join(import.meta.dirname, "server")).map((name) => join(import.meta.dirname, "server", name))];
  const newest = () => Math.max(0, ...code.map((file) => { try { return statSync(file).mtimeMs; } catch { return 0; } }));
  const startedWith = newest();
  let seen = startedWith;
  setInterval(() => {
    const now = newest();
    if (now !== startedWith && now === seen) {
      console.log("The server's code was updated, so it's restarting");
      process.exit(0);
    }
    seen = now;
  }, 10000).unref();
}
