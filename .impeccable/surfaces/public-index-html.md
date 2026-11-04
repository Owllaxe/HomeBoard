---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Home board main screen

Scope and mode: the board's one screen, on wall, laptop and phone. Operate.
Job: answer what's next today and when to leave, in two seconds.
Constraints: landscape 1280x800 touch first, cheap effects for a Raspberry Pi 5. All data is real apart from the AI box, which isn't connected yet.
Memorable moment: the tear line on the pass is the countdown to leaving.
Unresolved: real API field names; final screen location; voice button.

## Direction contract

THESIS: The next event is a ticket you hold; everything else waits its turn on a board that ranks itself by time. Refuses the grid of equal widget panels.

OWN-WORLD: Slate ground (#14171A), one paper pass (#F4F5F6), steel secondary text, Barlow and Barlow Semi Condensed with tabular figures, official MTA line bullets, one alert red reserved for changes. No cards on the board: rows on hairlines in a fixed column grid.

STORY: The owner sees what's next, sees when to leave and on which train, and walks out. A change stays lit until tapped.

FIRST VIEWPORT: Pass at left, 540px of 1280, four labelled segments, then the tear line, then a solid leave time beside an outlined current time, both at 100px. Right side: date, ranked schedule and live trains in the top two thirds, tasks by due date in the bottom third. Tapping the pass slides the board off a stationary map showing every route, with the unpicked ones grey and the options in a draggable row along the bottom. Swiping left opens the week. Swiping right moves the whole screen across so the pass stays in view on the right, with the menu and settings filling the left. A picked event sits on a dark pass and returns to the next event after 10 seconds.

FORM: Pass and Board (dealt challenger, not on my grounded list; vernacular-ephemera-boarding-pass-and-gate-board). seed:c81664acbb869c1d. Signature interaction: tear-line perforations count minutes until leaving, one notch per minute. Motion grammar: rows rerank in place keeping identity; the next row lifts onto the pass.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
