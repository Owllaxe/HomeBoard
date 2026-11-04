# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person per board: the owner, a New York City subway rider and student whose week mixes classes, meetings and assignments across several school systems. Anyone else should be able to run their own copy by changing settings, with nothing personal built in. The same page is used on a wall-mounted screen at home, a laptop and a phone.

## Product Purpose
A personal home board that answers "what's next today, and when do I have to leave for it?" It gathers schedule, tasks, assignments and live trains in one glanceable place. Success means no longer checking four apps before walking out the door, and never being surprised by a class, a deadline or a train.

## Positioning
It plans from the owner's own front door to each event using live train predictions, and turns that into a leave time attached to the day's schedule. A generic calendar display or subway app does only half of that.

## Operating Context
- Primary surface is a landscape 10-inch touch screen, at least 1280x800, driven by a Raspberry Pi 5 running a full-screen browser. The hardware has not arrived yet.
- Where the screen will be mounted is not decided, so it must read both close up and in passing.
- The screen stays on through day and night, with night dimming and tap to wake.
- The owner mostly glances for a few seconds. Long interactions happen on the laptop or phone.
- Glance priority is what's next today; the leave time attaches to the next event.

## Capabilities and Constraints
- Trains: MTA real-time subway feeds, which need no key and which the board reads directly in `public/mta.js`. Predictions reach about an hour ahead, so later events show an estimate that becomes exact trains closer to the time. Stations and track shapes come from the MTA's static data through `tools/build-network.mjs`, which should be rerun when the MTA changes service patterns.
- Routing between stations: direct, one transfer, or walking, across the whole subway system, in `public/routes.js`. Subway only, with no buses, PATH or LIRR. Routes come from weekday stopping patterns, and live trains decide which are running. The board offers several routes per event, and the owner can pick one.
- Home stations and the stations near each place are set in the menu with their walk times. The board works from stations, not street addresses, because turning an address into a location needs an outside service.
- Classes and meetings: Google Calendar through its private iCal link, read five weeks ahead. The week view scrolls through all five weeks, and swiping left again opens a timeline where each event is placed at its time and as wide as it lasts, with the pass shrunk to a mini version beside it. The AI only sees the next 8 days, to stay fast on a Pi.
- "Move all 8pm Math Classes in future weeks to 7pm" becomes a repeating change: a rule the code reads from the message itself (the class, the time before "to", the time after it, and a weekday if one is named), applied to every matching calendar event from that day on. Menu > Repeating changes lists them with Remove.
- Assignments: Brightspace through its calendar subscribe link. Gradescope, WebAssign and professor sites have no feed, so their lists are pasted into the AI box, which skips duplicates.
- Locations: home stations set in the menu. Vague locations are taught to the AI once (for example "mechanics is at Science Center").
- AI box: local Ollama model on the Pi, which can take one to three minutes per request today, with a target of about 15 to 40 seconds. Any AI interaction must tolerate that wait.
- Touch mode (`#wall`): built-in on-screen keyboard, tap-a-task buttons, night dimming.
- Everything is built in this project: a small Node server (`server.mjs`, `server/`) and the page (`public/`). The server reads the calendar links, which browsers can't, and keeps settings, tasks and links in `data/board.json`, so every screen shares them.
- The AI box runs a local model through Ollama (`server/ollama.mjs`), chosen with `OLLAMA_MODEL`, and is off without it. The best tested fit for an 8GB Pi is `qwen3.5:4b`. Small models are unreliable at dates and at picking the right event, so code does those parts and checks everything the model returns. `tools/test-ai.mjs` scores a model through the whole system.
- The tasks page fills the screen when you swipe up from home, scroll down, or tap All tasks. Tasks sit in categories, which start as each Brightspace course and can be your own, each with a color that shows as a tab on the home list. Hold a task and drag it onto a category to move it. Milestones are steps inside a task with their own dates, and a task rises on the home list when its next step is due sooner than the task. Categories and milestones are kept in `data/board.json` and laid over Brightspace, which is read-only. Its Done tab lists tasks finished in the last two weeks, with Not done to put one back.
- The phone and laptop page (`/send`) takes pasted assignment descriptions and a chat for changing the schedule. Messages are saved and queue for the AI, one at a time.
- Service alerts come from the MTA's alerts feed and only count where they touch your ride: the same line, direction and stops, at the time you'd travel. Weather comes from Open-Meteo, asked about the home station's position.
- The board keeps working without internet: the last calendar copy is saved and it says when what's showing is out of date.
- `deploy/` holds the Pi startup files. They are untested until the Pi arrives.
- AI requests took about 10 seconds on 4 laptop threads. A Pi 5 will be slower, and that hasn't been measured.
- Calendar links can only be read, so the AI's schedule changes are kept in `data/board.json` and laid over the calendar on the board. They never reach Google Calendar.
- Other devices need a 6-digit code from the board's menu before they can reach any data. Calendar links are never sent back to a browser.
- The Pi must render the board smoothly, so effects stay cheap.
- Planned, not built: voice button, phone notifications through a progressive web app.
- Undecided: final screen location and size.

## Brand Commitments
None yet. An earlier dashboard felt cluttered; avoiding that is a binding requirement.

## Evidence on Hand
This project is the whole product: no earlier code carries over. Trains, routes, calendar, assignments and tasks are all real. The calendar reader has only been tested on sample feeds so far, not a real Google or Brightspace link.

## Product Principles
- The next thing wins. Everything else steps back until it matters.
- Show a time you can act on, not a raw feed.
- Be honest about certainty: an estimate looks different from a live prediction.
- Earn every element. If it doesn't change what the owner does in the next few hours, it stays off the wall.
- The board is furniture. It lives in the home at all hours and should never nag or feel like work software.

## Accessibility & Inclusion
Must read at a distance and at a glance. Train lines and status can't rely on color alone. Touch targets must suit a wall screen operated standing up.
