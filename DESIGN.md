---
name: Home Board
description: A personal wall board where the next event is a ticket you hold and everything else waits its turn on ruled rows.
colors:
  alert: "#FF6A61"
  alert-ink: "#BC2A20"
  alert-press: "#96201A"
  alert-wash: "#3A1F20"
  alert-wash-press: "#5A2A2A"
  alert-flash: "#6E2B2A"
  on-alert: "#FFFFFF"
  line-123: "#EE352E"
  line-456: "#00933C"
  line-7: "#B933AD"
  line-ace: "#0039A6"
  line-bdfm: "#FF6319"
  line-g: "#6CBE45"
  line-jz: "#996633"
  line-l: "#A7A9AC"
  line-nqrw: "#FCCC0A"
  line-s: "#808183"
  stub-walk: "#50585F"
  slate: "#14171A"
  slate-up: "#20252A"
  hair: "#30363D"
  text: "#F4F5F6"
  steel: "#A7AFB8"
  paper: "#F4F5F6"
  carbon: "#2B3138"
  carbon-rule: "#49525B"
  carbon-ring: "#7B848D"
  press: "#D5D8DC"
  ink: "#14171A"
  ink-soft: "#50585F"
  rule: "#CDD1D5"
  notch-ring: "#858D94"
  night-ground: "#000000"
  night-paper: "#1C2024"
  night-ink: "#C7CDD3"
  night-ring: "#4A5057"
typography:
  stub-time:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "6.25rem"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  pass-title:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "3.875rem"
    fontWeight: 700
    lineHeight: 1.02
  segment-value:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.05
    fontFeature: "tnum"
  train-minutes:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  board-head:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  row:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.15
    fontFeature: "tnum"
  stub-sub:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    fontFeature: "tnum"
  control:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 500
    fontFeature: "tnum"
  row-detail:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 400
    fontFeature: "tnum"
  change:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  bullet:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1
  field-label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    fontFeature: "tnum"
  key:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 500
  small-action:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
  change-cue:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 500
  phone-stub-time:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "4rem"
    fontWeight: 700
  phone-stub-words:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
  map-label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  map-train-yours:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  phone-pass-title:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
  landscape-pass-title:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
rounded:
  none: "0"
  pass: ".5rem"
  circle: "50%"
spacing:
  frame: "2.25rem"
  pass: "2rem"
  title-gap: "1.5rem"
  row-column: "1rem"
  segment-cell: ".75rem"
  control-row: ".75rem"
  key: ".375rem"
components:
  pass:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pass}"
    padding: "2rem 2rem 0"
  pass-picked:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.text}"
    rounded: "{rounded.pass}"
    padding: "2rem 2rem 0"
  pass-night:
    backgroundColor: "{colors.night-paper}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.pass}"
  stub-walking:
    backgroundColor: "{colors.stub-walk}"
    textColor: "{colors.paper}"
    typography: "{typography.stub-time}"
    padding: "0 2rem 1.75rem"
  stub-change:
    backgroundColor: "{colors.alert-ink}"
    textColor: "{colors.on-alert}"
    typography: "{typography.change}"
    rounded: "{rounded.none}"
    padding: ".5rem 2rem"
    height: "3.5rem"
  stub-change-pressed:
    backgroundColor: "{colors.alert-press}"
  bullet:
    textColor: "{colors.on-alert}"
    typography: "{typography.bullet}"
    rounded: "{rounded.circle}"
    size: "1.875rem"
  board-row:
    textColor: "{colors.text}"
    typography: "{typography.row}"
    rounded: "{rounded.none}"
    padding: ".5rem 0"
    height: "4rem"
  board-row-changed:
    backgroundColor: "{colors.alert-wash}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: ".5rem .75rem"
    height: "4rem"
  board-row-changed-pressed:
    backgroundColor: "{colors.alert-wash-press}"
  menu-row:
    textColor: "{colors.text}"
    typography: "{typography.row}"
    rounded: "{rounded.none}"
    padding: ".5rem 0"
    height: "4.5rem"
  action-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.slate}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: "3.5rem"
    width: "8rem"
  action-primary-pressed:
    backgroundColor: "{colors.press}"
  action-secondary:
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: "3.5rem"
    width: "8rem"
  action-secondary-pressed:
    backgroundColor: "{colors.hair}"
  key:
    backgroundColor: "{colors.slate-up}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    height: "3.5rem"
  key-on:
    backgroundColor: "{colors.text}"
    textColor: "{colors.slate}"
  toast:
    backgroundColor: "{colors.text}"
    textColor: "{colors.slate}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: "3.5rem"
  route-option:
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: ".625rem .875rem"
    height: "4rem"
  route-option-on:
    backgroundColor: "{colors.text}"
    textColor: "{colors.slate}"
---

# Design System: Home Board

## Overview

**Creative North Star: "The Ticket You Hold"**

The next event is a boarding pass: one sheet of paper on a slate ground, with the leave time below a tear line that counts down to the door. Everything else waits on a departure board beside it, ruled rows that rank themselves by time. The system is built to be read in two seconds from across a room, so the pass is the only object, the board is only lines, and colour appears when it changes what the owner does next.

Density is low and sizes are large. One paper object, two ruled lists and one strip of live trains fill the frame, and a row that does not fit waits for the next page. The world refuses the grid of equal widget panels. Certainty is visible: a live time is heavy and punched, an estimate is lighter, dashed and labelled "about".

The pass keeps its size on every screen, so the next event is never out of sight. The map stays still underneath, and the board slides off it. The menu sits off the left edge, and opening it moves the whole screen across until the pass reaches the right side.

Trains, routes, events and tasks are all real data. The scene picker shows simulated states for checking how each one looks. The AI box is the one part not connected, and Add or ask stays out of the menu until it is. The visual rules hold; the field names do not.

**Key Characteristics:**
- One paper pass on slate, holding the next event, the leave time and the current time.
- White always means the next event. A picked event is a dark carbon copy.
- A solid leave time beside an outlined clock.
- A tear of 30 notches, one per minute, that doubles as the countdown.
- Board rows on hairlines in a fixed column grid, with no panels.
- One red family, spent on changes that hold until tapped.
- A weight, a dash and the word "about" mark every estimate.
- The whole frame scales in rem from one 1280x800 reference.

## Colors

Cool slate and paper neutrals carry everything; the only colours are one red for changes and the official subway lines.

### Primary
- **Change Red** (#FF6A61): The change wording on slate, and the live-trains failure line. Bold when it names a change.
- **Change Red, Deep** (#BC2A20): The change banner on the pass, with white text at 6:1. The brighter red cannot sit on paper, so this is the same voice on a light ground.
- **Change Red, Pressed** (#96201A): The banner while pressed.
- **Change Wash** (#3A1F20): The full-bleed ground of a changed row, pressing to #5A2A2A and pulsing through #6E2B2A when it arrives.

### Secondary
- **Subway Line Livery** (#EE352E 1/2/3, #00933C 4/5/6, #B933AD 7, #0039A6 A/C/E, #FF6319 B/D/F/M, #6CBE45 G, #996633 J/Z, #A7A9AC L, #FCCC0A N/Q/R/W, #808183 S): Official MTA colours, used only on line bullets, on the stub and on the route drawn on the map. An unknown line falls back to the S grey. These are not brand colours and are never used for anything but naming or boarding a train.
- **Walking Stub** (#50585F): The stub's colour within five minutes of leaving on foot, with light text. It shares its value with Soft Ink, so a walk reads as a neutral event with no line to name.

### Neutral
- **Slate** (#14171A): The ground of the whole screen, the ink on paper, and the fill of punched holes and side cut-outs.
- **Slate, Raised** (#20252A): The fill of controls only: Add or ask, the text field and the keys.
- **Hairline** (#30363D): Row dividers and control borders on slate.
- **Board Text** (#F4F5F6): Primary text on slate, the heavy rule under the board head, and light control fills.
- **Steel** (#A7AFB8): Secondary text on slate at 8:1, checkbox and button strokes.
- **Pass Paper** (#F4F5F6): The pass. It is the same value as Board Text, so the ticket reads as the brightest thing in the room.
- **Carbon** (#2B3138), **Carbon Rule** (#49525B), **Carbon Ring** (#7B848D): A picked event's pass, its ruling and its spent notches. Text on carbon is Board Text and Steel.
- **Light Press** (#D5D8DC): The pressed state of any light fill.
- **Ink** (#14171A): Text on paper.
- **Soft Ink** (#50585F): Field labels on paper and the dashes of an estimate's tear.
- **Paper Rule** (#CDD1D5): The ruling between segment cells.
- **Notch Ring** (#858D94): The outline of a spent minute on paper.
- **Night Ground** (#000000), **Night Paper** (#1C2024), **Night Ink** (#C7CDD3), **Night Ring** (#4A5057): The overnight set. Night Ink also replaces Steel on the board.

### Named Rules

**The One Alarm Rule.** The red family marks changes, and nothing else competes with it. A delay or planned work on your route is a change, so it takes the same banner as a moved class. The extensions are the loss of live trains, a place with no station and a calendar that stopped updating, all text only, because each changes what the board can tell you. A failed AI request is not a change and stays neutral.

**The Line Takes the Stub Rule.** Within five minutes of leaving, on an exact time, the stub fills with the train line's colour. Outside that window the stub is plain paper. An estimate never takes the colour.

**The White Means Next Rule.** Only the next event is ever on white paper. Anything picked from the schedule is on Carbon, so one glance tells you whether the pass is the one you leave for.

**The Higher Ink Rule.** Stub text takes whichever of Pass Paper or Ink reads better on the line colour. That gives light text only on A/C/E, 7 and J/Z, and dark text on every other line. Line bullets are a separate matter: they keep the official livery, with white letters on all lines except the yellow N/Q/R/W.

## Typography

**Display Font:** Barlow Semi Condensed (with Arial Narrow, Arial)
**Body Font:** Barlow (with Arial)

**Character:** Both faces descend from highway and transit signage. The condensed cut holds the big figures and event names, the normal width sets everything read at row height.

### Hierarchy
- **Stub Time** (700, 6.25rem, 0.9, -0.02em): The leave time and the current time, set side by side at the same size so they can be compared. This is the largest size at which two four-digit times fit across the pass. "Leave now" drops to 85% of this size and takes two lines.
- **Pass Title** (700, 3.875rem, 1.02, balanced wrap): The event name.
- **Segment Value** (700, 2.75rem, 1.05): Starts, Place, Train or Walk, Arrive. A value that truly does not fit drops to 73% and may wrap.
- **Board Head** (700, 1.625rem, 1.2): The date, Tasks, This week and the route title.
- **Train Minutes** (700, 1.75rem, 1): The minutes in the live trains strip.
- **Row** (400, 1.625rem, 1.15): Row titles, with the time column in 700.
- **Stub Sub** (500, 1.5rem): The line under the leave time.
- **Row Detail and Control** (400 and 500, 1.3125rem): Right-hand row detail and control labels.
- **Field Label** (500, 1rem, sentence case): The word naming a segment or the leave time. It labels a value in place, like a printed field on a ticket, and is never used as a heading above a section.

### Named Rules

**The Held Figures Rule.** Every number uses tabular figures, so clocks and countdowns never shift sideways. The CSS `font` shorthand resets this, so anything set with the shorthand that shows numbers must ask for tabular figures again.

**The Weight Is Certainty Rule.** A live time is 700. An estimated time is 500 in the same face and size. Weight alone never carries it: the dashed tear and "about" label go with it.

**The Solid Is Yours Rule.** The leave time is solid and the current time is an outline, with the stroke at .024em of the type size. Solid is what you act on. Only the clock is ever outlined.

## Layout

**The One Frame Rule.** All sizes are in rem and the root is `clamp(14px, min(1.25vw, 2vh), 24px)`, so the board scales as one frame from 16px at 1280x800. Nothing in the two-column layout is sized in pixels except hairline strokes.

The two-column frame fills the viewport height with no body scroll, at 2.25rem of padding and gap. The pass takes 45% of the width and the right side takes the rest. Inside the pass, the title and segments sit at the top and a flexible gap pushes the stub to the bottom edge. Segments are a 5:7 two-column table.

The right side shows one panel at a time, and the pass does not move or resize for any of them:

- **Board:** The schedule and live trains fill the top two thirds, and tasks fill the bottom third. Rows use a fixed grid of a 5.5rem time column, a flexible title and an auto-width detail capped at 18rem. Tasks add a checkbox column.
- **Route map:** Fixed in place. Tapping the pass slides the board off it to the right (460ms).
- **Week:** Swiping left on home brings it in from the right while the board leaves to the left.

The menu is not one of these. Swiping right moves the whole screen across by 55% of the frame, so the pass lands on the right side and the board goes off the edge. The menu takes the space on the left, and swiping left moves everything back.

**The Whole Row Rule.** The frame never scrolls and never cuts a row. Rows that do not fit are held back, a steel "N more" control shows the next page, the last page offers "Back to top", and each list returns to its first page by itself after 30 seconds. On the tasks list that control sits in the heading, so the bottom third keeps three full rows.

Add a task, and Add or ask once the AI is connected, live in the menu and open inside it, so the leave time stays in sight. Touch mode adds the on-screen keyboard below them.

Three layouts sit under the frame, and all of them fix the root at 16px:

- **Stacked** (up to 860px wide, up to 560px tall, or any portrait): One column at 1rem padding, the page scrolls, and both times are 4rem. The panels drop below the pass and swap without sliding. Rows take a 4rem time column and drop their detail to a second line. Ask covers the screen, and the toast floats 1rem from the edges.
- **Wide-stacked** (the same conditions at 640px wide or more): Still one column, but rows return to one line with a 4.5rem time column.
- **Landscape phone** (up to 560px tall in landscape): The pass itself becomes two columns. The stub moves beside the segments and the tear stands upright between them, with its cut-outs at the top and bottom.

**The Rubber Edge Rule.** Every sideways drag has a soft end. Pulling past it moves things less and less, following `5rem × (1 − e^(−pull ÷ 8rem))`, so it can never go further than 5rem and feels heavier the harder you pull. On release it springs back over 460ms. This covers the options row, the menu at its open position, and the far side of the menu and the week, where a pull goes nowhere.

## Elevation & Depth

The system is flat with one exception. The pass carries a single soft shadow (`box-shadow: 0 .75rem 2rem rgba(0,0,0,.35)`) because it is an object on the ground and the board is not. Everything on the board is flat and separated by rules. The pass's cut-outs add depth by subtraction, filled with the ground colour so they read as punched through.

**The One Lifted Thing Rule.** Only the pass has a shadow, and it loses it at night. If a second thing seems to need lift, it belongs on the board's lines instead.

## Shapes

Three shapes only. The pass has gently curved corners (.5rem). Circles (50%) are reserved for what a ticket and a transit map make round: line bullets, notches and the two 1.5rem cut-outs at the ends of the tear. Everything else is square, including buttons, keys, checkboxes, the text field and the toast. Rules come in two weights, 2px under the board head and at the top of the segments, and 1px between rows and cells.

## Components

### Pass
The ticket. Paper, inset on slate, with the shadow and corners described above. It holds the title, the segment table, one line of weather, any change banner and the stub, in that order. The weather says what to do about it ("52°, rain around 4 pm, take an umbrella"), uses only spare room, and leaves first when the pass is full. When the next event changes, the old row lifts off the board toward the pass while fading (420ms) and the new title and segments slide in 1.5rem from the right (460ms after 120ms).

- **Tap:** The whole pass opens the route map, and tapping it again closes it. The change banner stays its own tap on top. Pressing fills the pass with Light Press, or Hairline on Carbon.
- **Picked event:** Tapping a schedule row puts that event on the pass in Carbon, and tapping the row again goes back. Its row takes the raised fill while it is on the pass. It has its own map.
- **Skip:** An underlined "Skip" at the right of the stub's last line takes that one occurrence off the board, with Undo on a toast. It's its own tap, on top of the pass.
- **Going back:** A picked event returns to the next event 10 seconds after the last touch, closing its map if open. A thin bar along the top edge drains over those 10 seconds and refills on any touch.

### Tear
The signature. A row of 30 evenly spaced notches straddling the top edge of the stub, with a cut-out at each end.

- **Live minutes:** One notch per minute until leaving, shown as punched holes (.6875rem) in Slate, running from the left.
- **Spent minutes:** Rings of the same size (1.5px stroke) in Notch Ring, or Slate on a coloured stub.
- **Estimate or empty:** Short dashes (.625rem by 2px) in Soft Ink. A dashed tear makes no count, because no exact time exists to count down to.
- **Beyond 30 minutes:** Every notch is live, and the count begins as the last 30 minutes run out.
- **Smaller layouts:** Notches shrink to .4375rem stacked and .3125rem on a landscape phone, and the stroke drops to 1px.

**The Tear Is the Clock Rule.** The tear is a countdown, not decoration. Never use it as a divider on any other surface, and never show notches that are not counting real minutes.

### Stub
The part below the tear: the solid leave time at the left, the outlined current time at the right, each under a field label, then a line of detail ("in 3 min"). At zero the left side reads "Leave now" with no label. Within five minutes it fades to the line colour over 400ms, or to the Walking Stub colour when there is no train. The clock outline follows the stub's text colour. Notches fill over 500ms.

### Change
A change on the pass is a full-width banner on the paper directly above the tear (at least 3.5rem, Deep Change Red, white bold wording, an underlined "Got it" at the right). It sits on the paper so the stub's colour always breaks cleanly on the perforation. A change on the board is a row with the Change Wash running past the column edges and bold Change Red detail replacing the usual detail. It pulses twice on arrival (.9s each). Tapping the row puts the event on the pass, where "Got it" dismisses the change.

**The Held Change Rule.** A change never times out. It stays lit until "Got it" is tapped on the pass, and a row keeps its change when it lifts onto the pass, so dismissing it clears both. The 10-second return to the next event does not clear it.

### Board Rows
- **Names:** Course codes on the end of an event's name, like "(ART 1100)", are dropped everywhere on the board. Other brackets stay.
- **Structure:** Rows sit directly on the ground with a 1px hairline beneath, at least 4rem tall.
- **Schedule:** Today's events after the next one. The whole row picks the event.
- **Tasks:** Ranked by due date with the earliest on top. A 2.25rem square checkbox with a steel stroke sits at the right, and the whole row is the tap target. A ticked row strikes through in steel, gives a 1.4s beat, then leaves, with a 6-second undo toast.
- **AI jobs:** A long request becomes a row at the top of Tasks, so the board stays usable during the wait. While busy, its label breathes on a 1.6s opacity cycle. Finished jobs carry Dismiss, and failed ones add Try again.
- **Motion:** Rows keep their identity, so a rerank slides each row from its old position to its new one in place (520ms, `cubic-bezier(.16,1,.3,1)`) and the list is never redrawn. New rows fade in over 320ms.

### Live Trains
A strip between the schedule and tasks, at least 4rem tall. A line bullet, the direction in steel, the next minutes in bold condensed figures, then "min". When the feed is lost, the whole strip becomes one line of Change Red text.

### Route Map
A self-contained SVG of the whole city, drawn from the MTA's own stations and track shapes and the city's borough outlines, with no map tiles needed. It fits itself to each trip, up to a limit that keeps short trips from looking absurdly large. Land is Slate Raised and water is the ground. Every way to get there is drawn at once.

- **Picked route:** A thick line in the line's colour with a slate casing, so blue lines stay visible on dark land. The stretch before you board is thin and dimmed, because that is where your train is coming from. Walking is steel dots, and every stop is named.
- **Other routes:** Grey, thin and unnamed, with a grey line letter at the stop you would board at. They show no trains. Tapping one picks it, and picking one brings it to full colour.
- **Trains:** Moving line bullets, placed from live MTA predictions and travelling to their next position over 1 second. Your train is larger, has a light ring and is labelled "Yours". Markers leave the map when live trains are down.
- **Route options:** A horizontal row along the bottom, one 15rem square outlined card per route, with the line bullets, the station, leave and arrive times, and "Direct" or "1 transfer". The row scrolls sideways under a finger or a mouse drag when they don't all fit, coasts on release, and has no scrollbar: the cut-off card is the sign there is more. The picked card inverts to a light fill. Picking one updates the pass, including the leave time.
- **Status:** A line above the options saying where your train is, in plain words ("Your 9:03 is 4 stops from 2 Av."). When the route has a delay or planned work, it gives the MTA's wording in Change Red instead, and it also turns Change Red when live trains are lost. A route with an alert marks its option card in red too.
- **Home and destination:** The only squares on the map, set just off their stations, because the board knows the stations rather than the address.

### Menu
Reached by swiping right on the home screen or tapping "Menu", and following the finger as it comes. It fills the left of the screen, the same width as the board, with ruled rows at least 4.5rem tall: Add a task, Add or ask once the AI is connected, Dim at night, Extra time to leave, Home stations, Places, Calendar links, Phone and laptop, when live trains last updated, and Reload board. Tapping a row opens it over the list, with Back to return. Settings are joined square buttons, with the current one inverted to a light fill, and every screen shares them. Swiping left, tapping the pass or tapping "Back to today" closes it, and it closes by itself 30 seconds after the last touch unless you're typing. On a phone the menu replaces the home screen.

### Add a Task
A name, then a day from today to the end of the week, or No date. A task with no date reads "Later" and sorts last. Anything past due reads "Late" and sorts first.

### Calendar Links
A row each for Google Calendar and Brightspace, saying where to find the link, whether it's connected, and any problem in Change Red text. A saved link is never shown again, so the field stays empty and offers to replace it.

### Home Stations and Places
These open inside the menu. Home and a place work the same way: up to four nearby stations, each with its line bullets at 1.5rem, the minutes walked to it with a stepper, and Remove. Places lists every place the events use, and one with no station shows "Not set" in Change Red text, because it stops the board from working out a leave time.

**Find a station** has a text field, up to four results with their line bullets, and the on-screen keyboard in touch mode. Results narrow on each key. Bullets are what tell two stations with one name apart, such as the two called Fulton St. A connected complex counts as one station.

When an event can't be routed, the leave time reads "--", the line under it says what to set, and tapping the pass goes straight there.

An online event is not one of these, because there's nowhere to travel to. Its location reads "Online", "Zoom" or similar, or is a link. It never appears in Places. The stub says "Starts" in place of "Leave home" and counts down to the start, and the pass has no Arrive field and no map.

### Week
Reached by swiping left on the home screen or tapping "This week". One ruled row a day for seven days, on the same 5.5rem column as the rows. Each day is a row of square blocks in time order, sharing the width equally: a bold time above a title of up to two lines. One block never takes more than half the row. Events are raised blocks, and deadlines are steel outlines that say "Due". Four blocks fit, so a busier day shows three and "N more". An empty day says "Free". On a phone the blocks wrap to two per line. Swiping right or tapping "Today" goes back, and it goes back by itself 30 seconds after the last touch. The panels follow the finger, and a swipe past 20% of the width commits.

### Out of Date Notice
A line of Change Red text above the live trains strip, shown only when what's on screen may be old: the calendar can't update, or the page has lost the server. It says what's being shown, such as "Showing the copy from 8:10 AM".

### Line Bullets
Official MTA circles at 1.875rem with the line letter, growing to 2.5rem in the pass segments. The letter is always present, so a line never depends on colour alone.

### Controls
- **Touch floor:** Every wall control is at least 56px (3.5rem at the 16px root). Full-row tap surfaces are 64px.
- **Head links:** Underlined steel text at the right of a heading, with a 3.5rem tall tap area: Menu, This week, Today, Back to list, and the tasks "N more".
- **Actions:** Square, bordered in steel on no fill. Actions in the ask form are at least 8rem wide, and the primary is a solid light fill in bold.
- **Text field:** Raised fill, hairline border, 1.5rem text.
- **Keyboard:** Raised square keys. Engaged Shift and 123 keys invert to a light fill.
- **Toast:** A solid light bar over the foot of the board, with an undo action.
- **Pressed:** The wall has no hover, so pressed fills are the primary feedback. Raised controls press to Hairline, light fills to Light Press.
- **Focus:** A 2px outline at 2px offset, in Board Text on slate and Ink on the pass.

### Night
From data, the screen dims until tapped. The ground goes black, the frame drops to 50% opacity, the pass becomes Night Paper with no shadow, and the stub loses its line colour. The board reduces to two schedule rows, and tasks, paging, live trains and the head links leave. The map, menu and week close. Dim at night in the menu turns this off. A tap wakes the board for 20 seconds, and that tap only wakes it: it cannot tick a task, pick an event or clear a change.

### Send Page
The page for phones and laptops, at `/send`, and the only surface read at arm's length rather than across a room. One column up to 40rem, using the same tokens, faces and square controls as the board. The top is a joined two-way switch for Assignments and Change my schedule, then a text box with a line saying what to write, then a full-width light Send. Below that is the conversation on hairlines with the newest first, and each message says whether it's waiting, being worked on, done or failed. Failed messages offer Try again. While the AI isn't connected, a steel line above the conversation says so. Anything else first asks for the 6-digit code shown in **Menu > Phone and laptop**.

### Reduced Motion
All movement and pulsing stop, and state changes apply instantly. Motion is limited to transform, opacity and short colour fades, which a Raspberry Pi 5 can run smoothly.

## Do's and Don'ts

### Do:
- **Do** make the next event the largest thing on screen, with the leave time solid at 6.25rem on the 16px root.
- **Do** keep the pass the same size everywhere, and in view when the menu is open.
- **Do** keep the map still and move the board off it.
- **Do** size everything in rem so the frame scales as one piece.
- **Do** show an estimate with all three signs: weight 500, a dashed tear and an "about" label.
- **Do** keep a change lit until it is tapped.
- **Do** keep every wall control at 56px or more.
- **Do** keep a row's identity when it moves, so reranks slide in place.
- **Do** put the letter in every line bullet.
- **Do** keep night as a darker, quieter version of the same layout.

### Don't:
- **Don't** add cards, panels or widget grids to the board. Its only fills are controls, the changed row, the picked row, the toast and the week's blocks.
- **Don't** put anything but the next event on white paper.
- **Don't** use the red family for AI failures, emphasis, deadlines or decoration. Alert red is not Line 1/2/3 red, and neither stands in for the other.
- **Don't** use line colours outside bullets, the stub and the route on the map.
- **Don't** give an estimate the line colour, the notch count or "Leave now".
- **Don't** let the wall scroll or cut a row in half.
- **Don't** add a second shadow, or blur or backdrop effects of any kind.
- **Don't** round anything other than the pass, or make circles of anything other than bullets, notches, cut-outs and stops on the map.
- **Don't** time a change out or clear it on a wake tap.
- **Don't** treat the white-on-livery pairing of a bullet as a precedent for text colour elsewhere.
