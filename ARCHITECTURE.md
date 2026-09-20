# Architecture

The game consists of 23 ES modules under `js/`. The browser loads them itself;
there is no toolchain and no `node_modules` in what gets shipped. `index.html`
holds nothing but markup and CSS, plus a single line of Javascript:

```html
<script type="module" src="./js/start.js"></script>
```

If you need one single file (an artifact, an attachment), build it with
`python3 tools/singlefile.py`. The game itself never needs it.

![Component diagram: 23 modules in seven layered bands, imports only ever pointing
downwards, the way back up only through the two signals](docs/components.svg)

<sub>Every module may import from any layer below it, never the other way round. The only way
back up are the two signals distributed by `js/events.js`, connected once in `js/start.js`.
The order drawn is one valid order, not a forced one: much of what sits side by side is
independent of each other. Generated with `python3 tools/diagram.py`.</sub>

## The two rules

Everything else follows from these two sentences.

**1. Imports only ever point downwards.** The modules sit in a fixed order (the
table below). A module may only import from modules that come before it. That
rules out cycles, lets every file be read from top to bottom, and means the
order is already known when the files are joined into one.

**2. Upwards you report, you do not call.** The commands must not know the
display — that would break rule 1. Instead of calling `render()`, they report
that something has changed. Whoever wants to react has subscribed beforehand.

```js
// js/events.js — the only module right at the bottom
export function onChange(fn)   // the display subscribes
export function onTick(fn)
export function changed()      // "the game state has changed"
export function tick()         // "only time has moved on"
```

Two signals, because there are two very different cases:

| Signal | When | What hangs off it |
|---|---|---|
| `changed()` | An action, a purchase, an arrival — anything that changes the game state | a complete rebuild: header, map, panels, then saving |
| `tick()` | Every frame of a running animation | header and map, nothing else |

The difference is not cosmetic: during a flight `tick()` runs sixty times a
second. A full rebuild there would recreate the HTML of the open panel and write
the save to `localStorage` on every single frame.

Both sides are connected in exactly one place, in `js/start.js`:

```js
Events.onChange(()=>{ Display.render(); Commands.save(); });
Events.onTick(()=>{ Display.header(); Display.speedHint(); Draw.draw(); });
```

That is the entire coupling between the game and the interface. Only `start.js`
knows that both exist.

## Why not full MVC

There is a named command layer (`js/game/commands.js`) and an observer, but no
passive views. The panels in `js/ui/panels.js` hang their `onclick` straight on
the commands:

```js
btn('Deliver', 'go', locked, deliverAll)
```

The detour through intents ("the panel reports `{kind:'deliver'}`, the commands
decide") would have needed one extra token per command without making anything
simpler anywhere: the panels are the only callers, and a wrong call shows up
immediately. What the observer buys lies in the other direction — the commands
should know nothing about the display — and that part is done in full.

## The layers

From the bottom up. "Imports from" lists only the modules actually used.

| # | Module | Lines | What for | Imports from |
|--:|---|--:|---|---|
| 0 | `events.js` | 16 | The two signals | — |
| 1 | `basics.js` | 33 | Numbers, dates, angles, `$`, `ANIM` | — |
| 2 | `game/world.js` | 196 | Bodies, moons, landing sites, trading posts, goods | — |
| 3 | `game/physics.js` | 90 | Tsiolkovsky, Kepler, Hohmann, hops | basics, world |
| 4 | `game/state.js` | 55 | `S` and the queries on it | world |
| 5 | `game/graph.js` | 78 | Idealised cost, used for pricing | physics, state, world |
| 6 | `game/economy.js` | 108 | The order board, deadlines, bulk goods | basics, graph, physics, state, world |
| 7 | `game/actions.js` | 62 | Which manoeuvres are possible from here | physics, state, world |
| 8 | `map/geometry.js` | 182 | Where something sits on screen | basics, physics, state, world |
| 9 | `game/planner.js` | 88 | Route search for the player, date-aware | actions, basics, graph, physics, state, world |
| 10 | `game/commands.js` | 357 | **All commands.** Changes `S`, reports `changed()` | actions, basics, economy, events, geometry, graph, physics, planner, state, world |
| 11 | `map/canvas.js` | 56 | The three drawing layers and their helpers | basics, state, world |
| 12 | `map/rocketdata.js` | 19 | The rocket model as number arrays | — |
| 13 | `map/gl.js` | 288 | The three.js layer | basics, canvas, events, geometry, rocketdata, world |
| 14 | `map/rocket.js` | 76 | Attitude, flame, 3D model or hand-drawn | basics, canvas, gl, rocketdata, state, world |
| 15 | `map/view.js` | 87 | Which level the map shows; taps on it | basics, canvas, events, planner, state, world |
| 16 | `map/draw.js` | 301 | Sun, system, body — and `draw()` | basics, canvas, geometry, gl, physics, rocket, rocketdata, state, view, world |
| 17 | `ui/widgets.js` | 40 | Button, icon, chip, panel heading | basics, commands, state, world |
| 18 | `ui/pickcard.js` | 73 | The card for the selected map object | basics, canvas, events, graph, physics, state, view, widgets, world |
| 19 | `ui/panels.js` | 315 | Trading post, cargo, refuel, shipyard, route | basics, commands, economy, events, graph, planner, state, widgets, world |
| 20 | `ui/display.js` | 68 | Header, toast, autopilot bar, `render()` | basics, commands, draw, events, panels, pickcard, planner, state, widgets, world |
| 21 | `ui/menu.js` | 71 | Menu, fullscreen, legend, version line | basics, commands, draw, events, state |
| 22 | `start.js` | 58 | Connect, wire, load, `window.TO` | all |

### The places where the order is not obvious

**`game/commands.js` sits below the map and below the interface, not above
them.** A command like "land" needs geometry (where does the flight path run),
and the panels need the commands. Both at once only works if the commands sit
between geometry and the interface. That is possible because, thanks to rule 2,
they no longer need the display at all.

**`game/actions.js` is separate from `game/commands.js`.** `localActions()` only
says what would be possible; `doAction()` does it. The split is necessary
because the planner (9) needs the list of manoeuvres but sits below the
commands (10).

**`map/canvas.js` sits below `map/gl.js`.** The three.js layer has to know how
large the map area currently is, and it writes its messages ("loading", "no
WebGL") onto the 2D canvas. The drawing code itself (`drawSol`, `drawSys`,
`drawBody`, `draw`) sits above the GL layer instead, because it serves both
worlds.

**`map/view.js` sits below `map/draw.js`.** `mapView()` is pure state ("which
level is the map showing right now"), and `draw()` asks it first. Handling taps
lives in the same module, because a tap on the map changes exactly that state.

**`map/` is not a world of its own next to `ui/`, but the other half of the same
one.** Both are presentation; the only difference is what gets drawn on, canvas
or DOM. The code shows it clearly: `map/` imports from `ui/` nowhere, and
`ui/widgets.js` and `ui/panels.js` import from `map/` nowhere. The two halves do
not know each other. They only come together in `ui/display.js` (`render()`
calls `draw()`) and in `ui/menu.js` (fullscreen redraws the map). Splitting them
into two folders is a matter of technology, not of responsibility.

The one exception is `map/geometry.js`: it lives in the `map/` folder but is not
presentation, it is mathematics — where a body stands, how a flight path runs.
That is why `game/commands.js` may import it although it knows nothing else
about the map.

**`ui/pickcard.js` is separate from `ui/display.js`.** The card for the selected
map object is a panel like any other, it just sits in the main view instead of
in the panel column — it belongs next to `renderPlace()` from `ui/panels.js`,
not in the frame. While it lived in `ui/display.js` it pulled in 25 of the 47
names that module imported, and that alone lifted it above `game/physics`,
`game/graph` and `map/view`. Without it, `ui/display.js` gets by with 22 names.

**`ui/panels.js` sits below `ui/display.js`.** `render()` decides whether a
panel or the main view is visible, and then builds the panel.

## Three bindings that cannot simply be reassigned

ES modules do not allow an imported binding to be set from outside. Three places
in the old script did exactly that; they now have a named interface:

| Before | Now | Why |
|---|---|---|
| `S = {...}` in `newGame`/`load` | `setState(next)` in `game/state.js` | `S` stays a live binding: every module sees the new state at once |
| `HITS = []`, `HITS = HITS.filter(...)` | `clearHits([layer])` in `map/canvas.js` | `HITS` is now `const` and is emptied in place |
| `rocketMode = 'flat'` from the drawing code | `setRocketMode(mode)` in `map/rocket.js` | same again |

## Wiring

Every module that needs its own DOM events attaches them itself, in a function
that `start.js` calls once:

```js
View.wireMap();        // clicks on the two map canvases
Draw.wireDraw();       // window size, colour scheme change
Display.wireDisplay(); // tapping speeds up the animation
Menu.wireMenu();       // menu, waiting, legend, fullscreen, version
```

That way every event thread sits next to the code it sets off, and `start.js`
stays readable on one page.

## `window.TO` — the outside edge

`start.js` builds one flat interface out of all the modules:

```js
window.TO.S                    // the game state, always the current one
window.TO.doAction(a)          // every command that can be executed
window.TO.changed()            // rebuild and save
window.TO.module['map/gl']     // a whole module, when you want a closer look
```

The entries are read accessors on the respective namespace, not copies — so
`TO.S` still points at the right state after a restart. The game itself never
uses `TO`; it exists for the tests and for the console. That makes the list of
exports also the list of what is reachable from outside.

## Loading three.js

`start.js` fetches three.js only after the first frame is on screen, and with a
dynamic `import()`:

```js
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js')
  .then(THREE => Gl.glInit(THREE))
  .catch(e => Gl.glOff(...));
setTimeout(()=>{ if(Gl.GL.state==='loading') Gl.glOff('three.js could not be loaded.'); }, 10000);
```

A static import at the top of the file would take the whole game down with it if
the CDN is blocked. This way orders, route planner and autopilot stay usable and
only the map area says that it cannot work.

## Saved games

The storage keys are `transferorbit-v3` and `transferorbit-slot1`. When a save
cannot be found under those, `load()` falls back to the old keys
`transferfenster-v2` and `transferfenster-slot1` and runs `migrate()` over the
result: it maps the German ids that saves from before the translation carry —
ship ids (`kogge` → `cog`, `holk` → `hulk`, `hulk` → `galleon`,
`karacke` → `carrack`), site ids (`nordpol` → `northpole`,
`tigerstreifen` → `tigerstripes`) and trading post ids (`erde` → `earth`,
`werft` → `shipyard`, …) in the visited set, in the orders and in the three
economy maps. Everything else in a save is language-neutral. The mapping runs
before the sanity check, which would otherwise reject an old save outright.

## What the split changed

* `file://` no longer works. ES modules are fetched with CORS, and a file from
  the file system has no origin that allows it. Over GitHub Pages, or any other
  server, everything works as before.
* The local test server has to send `Access-Control-Allow-Origin: *`, because
  the test harness puts the game inside a `sandbox="allow-scripts"` frame — such
  a frame has an opaque origin, and the modules are then treated as foreign.
  That is what `tools/serve.py` (`npm run serve`) is for. GitHub Pages sends the
  header by itself.
* The tests talk to the game through `TO.*` instead of through global names.

Nothing about the game itself changed: same physics, same economy, same route
planner, same rendering.
