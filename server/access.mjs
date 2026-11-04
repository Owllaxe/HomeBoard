// Who may use the board. The screen it runs on always can. Anything else on the network has
// to enter the code shown in the menu once, because /api holds your calendar and tasks.
import { randomInt, randomUUID } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
// Addresses a computer gives itself and VPN ranges, which a phone can't use.
const UNREACHABLE = /^(169\.254|198\.1[89])\./;
const YEAR = 365 * 24 * 60 * 60;
const MOST_TRIES = 8;
const TRY_WINDOW = 60 * 1000;
// Only plain addresses and localhost. A website can't then point its own name at this
// machine to reach the board from your browser.
const HOST_ALLOWED = /^(localhost|[a-z0-9-]+\.local|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?$/i;

export function createAccess(store) {
  store.data.access ??= { code: String(randomInt(100000, 1000000)), token: randomUUID() };
  store.save();
  const { code, token } = store.data.access;
  let tries = [];

  const isLocal = (req) => LOOPBACK.has(req.socket.remoteAddress);
  const hostAllowed = (req) => HOST_ALLOWED.test(req.headers.host ?? "");
  const hasCookie = (req) => (req.headers.cookie ?? "").split(/;\s*/).includes(`board-access=${token}`);

  return {
    hostAllowed,
    isLocal,
    allowed: (req) => isLocal(req) || hasCookie(req),
    // Returns the cookie for a right code, or null. Wrong guesses are slowed right down.
    pair(given) {
      tries = tries.filter((t) => Date.now() - t < TRY_WINDOW);
      if (tries.length >= MOST_TRIES) return null;
      if (String(given) !== code) {
        tries.push(Date.now());
        return null;
      }
      return `board-access=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${YEAR}`;
    },
    // Shown only to the screen itself.
    details(port) {
      const addresses = Object.values(networkInterfaces()).flat()
        .filter((a) => a.family === "IPv4" && !a.internal && !UNREACHABLE.test(a.address))
        .map((a) => `http://${a.address}:${port}`);
      // A Pi answers to its name as well, which keeps working when its address changes.
      if (process.platform === "linux") addresses.unshift(`http://${hostname()}.local:${port}`);
      return { code, addresses };
    },
  };
}
