// Everything the board remembers, in one JSON file. The calendar links are private, so this
// file stays on the machine and the links are never sent back to a browser.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// `changes` are the AI's edits to the schedule, kept apart because the calendar is read-only.
// `taskInfo` holds each task's category and milestones the same way, since Brightspace is too.
// `doneAt` says when each finished task was ticked, for the list of recently done ones.
const blank = () => ({
  settings: null, links: { calendar: "", assignments: "" }, tasks: [], done: [], doneAt: {}, chat: [],
  changes: { add: [], move: {}, hide: [] }, taskInfo: {}, categories: [],
});

export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "board.json");
  let data = blank();
  try {
    data = { ...data, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    data,
    // Writes to a second file first, so a power cut can't leave half a file behind.
    save() {
      writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
      renameSync(`${file}.tmp`, file);
    },
  };
}
