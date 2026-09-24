# TransferOrbit – change log

The playable version in the repository is `index.html`. Tests are in `tests/`, the art in `art/`.

## 2026-09-24 – Waiting at stopovers; the autopilot shows its arrival (version 49)

**Deadlines count the wait at every stopover.** A route with more than one transfer, Venus → Mars
by way of Earth for instance, only counted the wait for the window of its first transfer; at the
stopover the ship arrived and flew straight on, as if the next window were always open. There it
can wait more than 100 days. `routeWait()` in `game/economy.js` replaces `legWait()`: it walks
the pricing route's connections (`route()` now returns them as `path`) by the date, and every
transfer leaves at its economical departure from the day the ship gets there. New orders and
freshly accepted ones get their deadlines from it.

**The autopilot bar shows the whole trip:** when the ship arrives at the target and how many days
that is from now, kept current while time runs, and below it the step in progress; under way,
where that flight arrives and when. `planner.remaining()` lays out what is left of the plan from
where and when the flight in progress arrives.

## 2026-09-24 – Rewards follow the delta-v, not the time (version 48)

With the new drives the game had become easy: the bots ended 120 steps on 0.26 to 1.66 million Cr
instead of 36,000 to 141,000. The reason was the time share of the reward (15 Cr per day plus 4 Cr
per tonne and day), two thirds of every reward, some 60,000 Cr on an average order: it paid for
days that cost the player nothing, and the better drives let the Cog fly almost every order.

An order now pays for the delta-v its route needs and no longer for its time:

```
reward = RATE_MASS·m·(e^(Δv/v_e) − 1) + 0.1·n·value (+ a share of the launch fee)
```

with v_e the Cog's exhaust velocity and m the cargo plus 8 t of ship. `RATE_DAY` and
`RATE_MASS_DAY` are gone. `RATE_MASS` is a first value, set with the bots: at 700 Cr per tonne
they end on 64,000 to 154,000 Cr (1500 gave 0.3 to 0.67 million), and propellant takes 30 to
60 % of the income again. Deadlines still follow the route's days.

## 2026-09-24 – Drives of the future (version 47)

The ships' drives move up a technology step, so there is delta-v to spend on faster flights:

| Ship | Drive | Isp | Δv empty | Δv with a full hold |
|---|---|--:|--:|--:|
| Cog | solid-core fission | 450 → 900 s | 9.0 → 18.0 km/s | 3.7 → 7.5 km/s |
| Hulk | liquid-core fission | 600 → 1500 s | 12.9 → 32.3 km/s | 5.1 → 12.8 km/s |
| Galleon | gas-core fission | 650 → 2500 s | 12.6 → 48.5 km/s | 5.5 → 21.1 km/s |
| Carrack | fusion | 900 → 4000 s | 15.8 → 70.3 km/s | 8.4 → 37.4 km/s |

(A full hold counts 8 t per container.) Burns are still impulsive, which a real fusion drive with
its low thrust could not do; for the game that is fine.

Rewards pay for the propellant as the Cog burns it: `V_EXHAUST` is now the Cog's exhaust velocity
instead of a chemical 450 s. The fuel share of a reward therefore shrinks as the Cog's fuel bill
does, and a better ship earns its edge. `MAX_ROUTE_DV` goes from 12 to 20 km/s, since the old
"no ship manages a longer route" no longer holds.

On a new game (five seeds) the Cog can fly 93 % of the orders on the board with a full tank,
against 47 % before; the mean reward per order drops from about 104,000 to 80,000 Cr, and 95
instead of 12 of the orders run over routes of more than 12 km/s.

## 2026-09-24 – Transfers you can shape: departure, flight time, plans of steps (version 46)

**Transfers follow the physics now.** A transfer between two planets used to cost the Hohmann
value in the window and, anywhere else, a rule of thumb: a surcharge on the excess speed that grew
with the distance from the ideal phase angle, and a flight up to 30 % shorter. Now it is a Lambert
problem on the game's circular orbits, solved in the plane after Izzo (2015), which stays exact at
180 degrees where the classic form divides by zero. What a transfer costs follows from the angle it
sweeps and its flight time. The Hohmann window is simply the cheapest case (Earth → Mars: 1.37 km/s,
259 days), and leaving far from it is expensive for real: on the first day of the game 19 km/s
with the longest flight the table covers, where the rule of thumb said 7.7.

**Transfer tables.** Every pair of planets has a table of excess speeds over transfer angle (120
steps) and flight time (48 steps, a quarter to twice the Hohmann flight). `npm run tables`
(`tools/transfertables.js`) computes all 42 in under a second and writes `js/game/transfertables.ts`,
one byte per value on a logarithmic scale; a unit test fails as soon as the tables and the orbits
disagree. The table is for looking and searching (0.5 % off on average); a transfer burns the exact
value. Over the phase angle at departure, as first drawn, the tables were off by 200 % for fast
targets such as Mercury, which is why the model now keys them by the transfer angle.

**Plans of steps.** The route planner drafts a plan from one of three presets, each a value of a
day in delta-v: *economical* 1 m/s, *balanced* 15 m/s, *fast* 100 m/s. A preset whose plan does not
fit the tank steps down (50, 25, 15, 5, 1), so fast means as fast as the tank allows. Then every
step can be changed:

- a transfer on its **map**: delta-v over departure day and flight time, lighter is cheaper,
  hatched is more than the ship has, the dashed line is the deadline of the cargo for the target;
  tapping picks when to leave and how long to fly;
- where **aerobraking and burning** join the same two orbits, a button switches the step.

A changed step is pinned and marked "your choice". After every change and every step flown the
rest is planned again around the pinned steps; a pinned departure the ship can no longer make loses
its pin, and the panel says so. The autopilot flies the plan; waiting is part of a transfer step.

| Earth high orbit → Pavonis Mons, Hulk | Δv | Days |
|---|--:|--:|
| Economical | 2.14 km/s | 714 |
| Balanced | 2.42 km/s | 678 |
| Fast | 11.70 km/s | 342 |

`legWait` for the order board, the window marker on the solar system map and the planet card now
read the same tables. `RouteMode` and `transferWindow` are gone: a connection has a transfer window
exactly when it has a transfer table. The domain model says all of this first; its list of places
where the code does not follow is empty again.

Still open: the days of a route with stopovers, which price the orders and set their deadlines,
leave out the waiting for the next window at every stopover.

## 2026-09-20 – MIT licence

The game — `index.html`, `js/`, `tools/`, `tests/` — is now under the MIT licence, copyright
scuzzar: use it, change it, build on it, sell it, as long as the copyright notice travels with it.
`LICENSE` holds the text, `README.md` a short section.

`art/` is carved out and keeps the terms it came with: the models from Hanseatic Galaxy, the planet
textures from I, Voyager (Apache 2.0) and Solar System Scope (CC BY), all in `art/licences/`. The
game loads none of them — the surfaces are drawn in the browser — so the MIT part stands on its own.

`index.html` carries a two-line notice pointing at `LICENSE`. In the single file, which travels
alone, `tools/singlefile.py` replaces that notice with the full licence text, which is what MIT
asks for.

## 2026-09-20 – "Leave now" means it now (version 45)

Closes the oldest half-open item from version 20: **Moon → Earth took 43 days**, and there was
nothing the player could do about it.

The route search weighed a day at 0.01 m/s (`c = dv + days*0.01`). Coming back from Shackleton it
therefore always took the aerobraking step into low Earth orbit — 40 days for 60 m/s — instead of
the direct burn that sits right next to it in the action list: 1 day for 3006 m/s. 39 days saved
were worth 0.39 m/s against 2946 m/s spent, a factor of 7500. Time was free.

The two chips in the route panel did not help, because `mode` was only read inside the branch for
interplanetary legs (wait for the window, or fly now). A route without such a leg came out
identical both ways, so the panel offered two buttons with the same answer.

The weight is now a property of the mode, `DAY_COST` in `js/game/planner.js`:

```js
const DAY_COST = {eco:0.01, now:100};
```

`Economical` is unchanged. `Leave now` now means it everywhere: it neither waits for a window nor
dawdles on the way. The threshold for this route is 75 m/s per day; 100 gives some room.

| Shackleton → Kourou | Δv | Days |
|---|--:|--:|
| Economical | 2.83 km/s | 43 |
| Leave now | 5.78 km/s | 4 |

The Cog has 8.99 km/s with a full tank and an empty hold, and 6.77 km/s with 10 t of cargo, so the
fast route is affordable for a while. Beyond that the panel greys the autopilot out, as it already
did. What it costs is about 26 t of propellant, at Shackleton's 150 Cr/t some 3900 Cr, against a
time component in the reward of roughly 3400 Cr for those 39 days — the choice is close, which is
exactly why it should be the player's.

Nothing else picks up the new weight: the order board, `nearestFuel()`, the pricing graph and the
bots all run on `eco`. `tests/regress.js` now checks that the two modes really do differ.

The other half of that old note — the order board showing the gross reward rather than the net
after fuel — will stay as it is. Deciding what a run is worth is the player's job, and the
numbers needed for it are all on the screen already.

## 2026-09-20 – The planet surfaces as their own module (version 44)

`map/geometry.js` carried 41 lines that were not geometry: `LAND`, `WATER`, `DESERT`, `CAPS`,
`EARTH_LAND` and `LIGHT` — the coastlines, the water, the desert belts, the polar caps, the two
Earth colours and the direction the light comes from. The rest of the module never read a single
one of them, and the only consumer anywhere was `map/gl.js`, which paints its textures from them.

They are now **`js/map/surface.js`** (49 lines, no imports at all), standing next to
`js/map/rocketdata.js` for the same reason: numbers, not code. `map/geometry.js` is left with 134
lines that really are what the module claims — where a body stands, how a flight path runs — which
is also what justifies `game/commands.js` importing it.

Nothing else changed: same data, same values, same pictures. 24 modules now instead of 23, still
no cycle and still no import pointing upwards.

## 2026-09-20 – The split gone over again (version 43)

A pass over all 23 modules, looking for dead code, for parts that sit in the wrong file and for
seams worth splitting. Nothing about the game changed.

- **Dead code removed.** Five declarations that nothing anywhere referenced — not in `js/`, not in
  `tests/`, not in `index.html`: `acceptOrder()` in `game/commands.js` (its last caller went when
  the order board switched to `acceptSelected()`), `bezier()`, `drawPath()` and `shipGlyph()` in
  `map/canvas.js` (leftovers of the single script, from before the 3D layer drew the paths and the
  ship), and `ICE` in `map/geometry.js`. With them, the now unused import of `postLabel` in
  `game/commands.js`.
- **29 unused CSS rules removed from `index.html`**, 16 classes in all: `.act` (with `.act .t`,
  `.act .t b`, `.act .t small`, `.act .c`, `.act.hot`), `.tr`, `.tr.sel`, `.tr-top`, `.tr-bot`,
  `.win`, `.top`, `.topr`, `.sub`, `.line`, `.foot`, `.fsbtn`, `.dvnum`, `.sysname`, `.stats3`,
  `.manual`. No markup and no module produces any of these class names. 403 lines → 373.
- **`BACK_LABEL` moved** from `game/commands.js` into `ui/widgets.js`. It is the caption of the
  back button — `Map`, `Order board`, `Cargo hold`, `Route` — and `ui/widgets.js` was its only
  reader. Interface text now sits in the interface.
- **The rest of the German** that the translation had left behind: the parameter `ebene` in
  `clearHits()`, the continent comments in `map/geometry.js` (`Nordamerika`, `Irland`, `Island`, …),
  three comments in `map/draw.js`, `innerer, blasser Rand` and `Cassini-Teilung` in `map/gl.js`,
  and the CSS comments `/* Aktionen */`, `/* Standort, kompakt */`, `/* Streckenplan */`.
- **`tools/diagram.py` counts how often the commands report** instead of carrying the number by
  hand. The diagram said `commands, 29×` while the code had 28; it now reads the real 27.

Checked and left alone: there are no cycles and no import pointing upwards, the longest chain of
imports is nine modules deep, and exactly one line of code appears in two modules (`if(done.has(ck))
continue; done.add(ck);` in `game/graph.js` and `game/planner.js` — two Dijkstra loops that are
deliberately separate, one idealised for pricing, one date-aware for the player).

## 2026-09-20 – Everything translated into English (version 42)

The code, all visible text and the documentation are now English. Nothing about the game itself
changed: same physics, same economy, same route planner, same rendering.

- **Files and folders**: `js/spiel/` → `js/game/`, `js/karte/` → `js/map/`, and every module
  underneath (`welt.js` → `world.js`, `steuerung.js` → `commands.js`, `zeichnen.js` → `draw.js`, …).
  `tools/einzeldatei.py` → `tools/singlefile.py`, `tools/diagramm.py` → `tools/diagram.py`,
  `ARCHITEKTUR.md` → `ARCHITECTURE.md`, `docs/komponenten.svg` → `docs/components.svg`.
- **Signals**: `geaendert()` → `changed()`, `zeitLief()` → `tick()`, `beiAenderung`/`beiZeit` →
  `onChange`/`onTick`. Along with them `setzeStand` → `setState`, `hitsLeeren` → `clearHits`,
  `bewegungPlanen` → `planMove`, `verdrahte…` → `wire…`, `KONTORE` → `POSTS`, `kontorAt` →
  `postAt`, `ANIM.sofort` → `ANIM.instant`.
- **Numbers and dates** now use `en-GB`: 20 Sept 2030, 20,000 Cr, 1.37 km/s.
- **Ships**: Kogge → Cog, Holk → Hulk, Hulk → Galleon, Karacke → Carrack. Holk and Hulk are both
  called "hulk" in English, so the 900,000 Cr bulk freighter became a Galleon — four real ship
  types, no collision, and the Hanseatic flavour survives.
- **Trading posts** are called trading posts. "Kontor" is an accepted English term for a Hanseatic
  trading post, but it is still a German word.

Ids inside the data were only renamed where they were German: `nordpol` → `northpole`,
`tigerstreifen` → `tigerstripes`, `erde` → `earth`, `werft` → `shipyard`, and the ship ids.
Everything else (`kourou`, `jezero`, `he3`, `earth.surf`) was already language-neutral.

**Old saves keep working.** The storage keys are now `transferorbit-v3` and `transferorbit-slot1`;
when nothing is found there, `load()` falls back to the old keys and maps the German ids across the
visited set, the orders and the three economy maps. That runs before the sanity check, which would
otherwise reject an old save outright.

Two bugs fell out of the translation, both of the same kind — renaming a quoted id does not catch
composite keys or unquoted object keys:

- `FUEL_PRICE` still had `'mars.surf@nordpol'`, `'ceres.surf@nordpol'` and
  `'enceladus.surf@tigerstreifen'`, so three depots would have disappeared.
- `HUBS`, `RESCUE_DAYS` and `BACK_LABEL` were keyed on unquoted `werft`, `kontor` and `fracht`.

One dead import also came to light: `map/draw.js` imported `K` from `game/world.js`, the trading
post constructor, which a local variable of the same name had shadowed all along. It was never used.

## 2026-09-20 – The pick card as its own module, dead code removed (version 41)

`ui/anzeige.js` was meant to be the frame — header, toast, autopilot bar and `render()`. But it also
held `renderPick()`, the card for the selected map object: 59 of 145 lines, and that function alone
needed 25 of the 47 names the module imported. That was the only reason `ui/anzeige.js` depended on
`spiel/physik`, `spiel/graph` and `karte/ansicht`.

`renderPick()` now lives in `ui/pickkarte.js` (72 lines). It is a panel like any other, just in the
main view instead of the panel column — it belongs next to `renderPlace()`. `ui/anzeige.js` shrinks
to 67 lines and 22 imported names.

`actionTags()` was deleted outright: 14 lines that were never called. That was already true in the
old single script; the module split only made it visible.

`tools/diagramm.py` now reads line count, module count and version number from `js/` instead of
carrying them in a table of its own. The numbers in the diagram can no longer go stale.

Nothing about the game changed.

## 2026-09-20 – The game now lives in modules (version 40)

`index.html` was a single file of 2,645 lines, 2,242 of them in one `<script>`. There was barely a
way to change anything without reading all of it. The script now sits in 22 ES modules under `js/`;
`index.html` holds nothing but markup, CSS and one line:

```html
<script type="module" src="./js/start.js"></script>
```

Two rules hold it together, described in full in `ARCHITEKTUR.md`:

1. **Imports only ever point downwards.** The modules sit in a fixed order, no cycles.
2. **Upwards you report, you do not call.** Instead of calling `render()`, the command layer reports
   `geaendert()` (the game state changed) or `zeitLief()` (only time moved on). The display
   subscribes for it. Both sides are connected in exactly one place, in `js/start.js`.

That way no game module knows the interface any more. The command layer (`spiel/steuerung.js`)
collects everything that changes the game state; everything that only asks sits below it.

New along with it:

- `window.TO` is the single outside edge: every exported name from every module, as a read accessor,
  plus `TO.modul['karte/gl']` for a whole module. The tests use it instead of global names.
- `tools/serve.py` (`npm run serve`) sends `Access-Control-Allow-Origin: *`. The test harness puts
  the game inside a `sandbox="allow-scripts"` frame; such a frame has an opaque origin, and without
  the header the browser refuses the modules. GitHub Pages sends it by itself.
- `tools/einzeldatei.py` builds a single HTML file back out of `js/`, for artifacts and attachments.
- `ANIM.sofort` skips animations. Until now the game bot overwrote `animateTo` for that, which no
  longer works with modules.
- `bewegungPlanen(a)` was lifted out of `doAction`: a move can be set up without letting it run.
  `tests/rakete-bilder.js` uses it to capture the individual phases.
- `RAKETE_ZULETZT` remembers where the rocket was drawn last.

`file://` no longer works: ES modules are fetched with CORS, and a file from the file system has no
origin that allows it. Over GitHub Pages everything runs as before.

Nothing about the game itself changed — same physics, same economy, same route planner, same
rendering.

## 2026-09-20 – 2D and 3D layers rigidly coupled (version 39)

The 3D sphere sat offset against the grid and the labels as soon as the autopilot bar appeared above
the map. Measured, it was 38 px vertically.

- **Cause:** `#cv` is a flex child of the stage and gets centred, so it moves when the stage changes.
  The layers `#cvb` and `#glc`, by contrast, were positioned absolutely at coordinates measured
  during the last draw. `render()` calls `draw()` **before** `renderAutobar()`; when the bar appears
  the layout therefore changes after the draw, and nobody measures again.
- **Fixed structurally rather than by re-measuring:** all four canvases now sit in a shared box
  `.cwrap`. That box is the element the stage centres, the front canvas gives it its size, and the
  rear layers sit in its top left corner. They line up by themselves, no matter when the drawing
  happens.
- `layFor` only sets the size now; the position comes from the box.

## 2026-09-20 – Version number in the menu (version 38)

- The bottom of the menu now reads "Version NN · as of DD.MM.YYYY, hh:mm". The date comes from
  `document.lastModified`, i.e. the state of the file actually delivered. An old date there means a
  stale copy is in the browser cache — GitHub Pages sets `max-age=600`, so it holds `index.html` for
  ten minutes. A hard reload (Ctrl+Shift+R) fetches it straight away.
- The number lives in the constant `VERSION` right next to `START_DAY` and is bumped with every new
  version.

## 2026-09-20 – Orbits in 3D, real depth for the rocket (version 37)

Three bugs with the same root: orbits and rocket were on different layers and therefore could not
hide each other.

- **Orbit rings and flight paths now live in the 3D layer.** Before they were drawn onto the front
  2D canvas, which sits above the 3D layer — so the orbit ran straight across the rocket. WebGL
  cannot widen lines (always 1 px), so they are narrow ribbons of triangles: the same width and dash
  pattern as before, computed in screen coordinates plus depth, i.e. with the same projection as the
  2D path. Two passes preserve the old look: faded without a depth test (the far side shows dimmed
  through the body), then the full one with a depth test.
- **The rocket sits at its real depth** instead of always being in front. Before it was either fully
  in front or entirely gone, depending on whether its centre was behind the body; at the limb it
  jumped. Now the body hides it pixel by pixel.
- **Standing on the surface it goes in front of the whole sphere.** Taking the surface depth at its
  foot point is not enough: the sphere curves across the 22 px width of the rocket and hid its inner
  half — after landing it was half sunk into the planet.
- The opacity used when leaving a moon orbit (`fade`) applies to the rocket again; it used to hang
  off the 2D context and so passed the 3D rocket by.

## 2026-09-20 – No more fallback to 2D (version 36)

The body view and the system view now exist in 3D only. If three.js does not run, the map area stays
empty and gives the reason, instead of quietly showing a second, poorer rendering.

- **Removed:** `shadeSphere`, the 2D sphere with its base colour, the continents as polygons on the
  sphere (`surfPoly`), the painted polar caps, the terminator as a half ellipse, the limb darkening,
  the 2D Saturn ring and the 2D bands of the gas giants. The data behind them (`LAND`, `WATER`,
  `DESERT`, `CAPS`) stays, because the maps for three.js are built from it now.
- **A note instead of the fallback** on the map area: "This map needs WebGL", plus the reason and a
  note that orders, route planner and autopilot keep working. While three.js loads it says "Loading
  the 3D view …". If the module never arrives, a timeout after 10 seconds switches to the error
  message so it does not sit at "loading" forever.
- The switch `use3D` gave way to an explicit rocket mode: `gl` for the three.js model, `flat` for the
  hand-rolled 2D renderer (the Sun view and the faded far side of a landing site), `none` for the
  rocket behind the body, where only flame and thrusters matter.
- The top-down view of the solar system and the rocket within it stay flat; `rocketMesh` is needed
  for that and stays.

## 2026-09-20 – Surfaces without foreign textures (version 35)

Version 34 loaded planet textures from `art/texturen/`. Those files stay in the repository but are no
longer used: the game draws the surfaces itself.

- **Maps are built in the browser**, equirectangular at 1024×512, the first time a body needs one:
  Earth from the same hand-drawn outlines as the 2D view (`LAND`, `WATER`, desert belts), plus polar
  caps from `CAPS` and, for Jupiter and Saturn, the four bands the 2D shading used to paint. Bodies
  with no features get no map at all; the base colour is enough for them. Saturn's ring is drawn too,
  with the Cassini division.
- **That way the 3D layer loads not a single file any more** apart from three.js itself. It also
  explains why it did not run at all in the artifact on claude.ai: there the page's origin is "null",
  so the game's own images count as a foreign origin and WebGL refuses them without a CORS header.
  The check from version 34 never fired, because `location.origin` reports the URL inside a locked
  iframe rather than "null"; it has been removed outright.
- The polar cap needs a soft edge that scales with its own size. A fixed share of the map height was
  wider than half of the 10° Mars cap and turned it into a veil of light at the pole.
- `art/texturen/` stays in the repository, as do the licences in `art/lizenzen/` (Solar System Scope,
  CC BY; I, Voyager, Apache 2.0). The game touches neither any more.

## 2026-09-20 – three.js for the bodies (version 34)

The celestial bodies are now drawn by three.js, loaded as an ES module from
`cdn.jsdelivr.net/npm/three`. No toolchain, no dependency in the repository. Everything else stays as
it was: physics, economy, route planner, autopilot and the whole interface are unchanged.

- **Three layers stacked.** `#cvb` (2D, behind) – `#glc` (three.js) – `#cv` or `#sys` (2D, in front).
  Hidden pieces of an orbit belong on the rear layer so the body keeps covering them. Labels,
  markers, dashed orbits, flames, thruster puffs, the re-entry glow and all hit targets (HITS) stay
  on the 2D canvas.
- **The same projection as before.** The three.js camera is orthographic and works in screen pixels,
  with the same values as `makeCam` and `drawSys`: 22° elevation in the planet view with a viewing
  direction per body from `bodyView(b)`, `SYS_EL` = 35° in the system view. 2D and 3D therefore line
  up exactly.
- **Textures** from `art/texturen/` (1024×512, equirectangular) for the seven planets and seven
  moons. Phobos and Deimos have no texture and keep their base colour. (Removed again in version 35,
  see above.)
- **The terminator** comes from the lighting instead of a drawn half ellipse. The directional light
  sits in camera coordinates along the vector `LIGHT`, exactly as before.
- **Saturn's ring** as a plane in the equatorial plane with `Saturn_rings.png`. Outside the rings the
  image has black pixels with residual opacity, so on load the brightness is used as the opacity —
  otherwise a dark veil would lie across the planet.
- **The rocket** as a real triangle mesh (the same 608 triangles and the same 4×4 palette as before),
  lit rather than shaded by hand. Attitude, length and roll are unchanged. It sits in camera
  coordinates in front of the bodies; behind a body it is not drawn at all, as before.
- **Fallback to 2D.** The old path is kept in full and takes over when WebGL is missing, the context
  is lost, three.js does not load or a texture cannot be loaded. Inside a locked iframe (claude.ai)
  the page's origin is "null"; the game's own images then count as a foreign origin and WebGL only
  accepts them with a CORS header. A 186-byte probe (`palet_4x4.png`) checks that beforehand so not
  every texture fails on its own.
- **On mobile:** pixel ratio capped at 2, textures stay at 1024 px.
- Cost per frame (Earth in orbit, measured in the test Chromium): 0.9 ms with three.js against 2.0 ms
  on the 2D path. The expensive part (sphere, continents, grid, terminator, 608 sorted triangles) now
  sits on the graphics card.
- The top-down view of the solar system (`drawSol`) stays flat, as planned.
- `tests/rakete-bilder.js` now runs over `http://localhost:8765` instead of `file://` and hooks
  `drawRocket` instead of `rocketMesh`, so both paths are checked.

## 2026-09-19 – Slow animation, 3D rocket, location fix (versions 29–33)
- Animations run 2.3× slower. Tapping the map makes them 6× faster. With the autopilot the speed-up
  holds all the way to the target. A hint "Tap: faster" sits in the top right.
- Manoeuvres with a change of attitude: the rocket turns smoothly (retro burn backwards, launch
  vertical). While turning there are thruster puffs at the nose, while burning a flickering flame
  from the nozzle.
- Version 31: restored after an older chat had overwritten the prototype.
- Version 32: fix for desktop. When the autopilot arrived at the target (or stopped at a post with a
  delivery), the route planner stayed open and the location card (deliver, orders, refuel) was gone.
  In those cases it now returns to the map. On a manual stop the planner stays open.
- Version 33: 3D rocket from Hanseatic Galaxy (Ship/SimpleRocket, the rocket from the README
  screenshot).
  - The model is simplified from 1,826 to 608 triangles (clustered per colour) and uses the colours
    of the 4×4 palette (PICO-8).
  - The rocket is 22 px long and the same in every view: direction of flight in the image plane, nose
    tilted slightly towards the viewer, slow roll around the long axis. Sorted by depth, lit from the
    upper left.
  - Cost: about 1.7 ms per frame.
  - On a landing site the rocket now stands 17 px from the marker instead of 13 px.
- Set up a repository of its own with the prototype, art, tools and tests (version 33).

## 2026-09-19 – 3D views and physical manoeuvres (versions 22–28)
- Earth with continents (rough outlines, about 40 points per continent). Spaceports at their real
  latitudes and longitudes. Labels that would run off the edge switch sides.
- Fullscreen back (map row and menu), with a note when the browser blocks it. Safari on iPhone cannot
  do fullscreen for pages.
- Route planner with refuelling at the bottom: "Fill up", "Enough for the route" (+3%), "Choose a
  different amount". Afterwards it returns to the planner.
- Luck factor on the reward: usually 0.9–1.2, in 8% of cases 1.4–1.9 (high values rarer). Mean 1.09.
- Planet view in real 3D with a fixed camera 22° above the equator. If the landing sites are in the
  south, the camera looks from below. The viewing direction is chosen per body so that as many
  landing sites as possible face the viewer (the Moon from the south, so Shackleton is visible).
  Light from the upper left with a terminator, grid, polar caps and a hidden far side. Sites on the
  far side are faded but still tappable.
- Manoeuvres in the planet view:
  - Launch: vertical, then east into an orbit inclined to match the latitude of the launch site.
  - Landing: coast to the braking point (the orbital plane rotates towards the landing track), retro
    burn, descent, vertical touchdown, re-entry glow in atmospheres.
  - Hop: a ballistic great-circle arc.
  - Raising/lowering an orbit: a Hohmann half ellipse at Kepler pace.
  - The flame shows the direction of thrust. In orbit the ship keeps circling while idle.
- System view (a planet with its moons) in 3D with a 35° camera: shaded spheres, Saturn's ring,
  Jupiter's bands.
  - High orbit → moon: a transfer ellipse meeting the moon where it will be.
  - Moon → high orbit: an ellipse outwards.
  - Low ↔ high orbit: a Hohmann transfer.
  - Aerobraking: several passes with a shrinking ellipse.
  - The ship keeps circling while idle (low orbit, around moons, slowly in high orbit).
- Solar system (the top-down view stays): transfers as a conic through departure and target (at 180°
  exactly a Hohmann), the ship at Kepler pace, a burn flame at departure and arrival.
- The scale of the orbital altitudes is deliberately exaggerated. Shapes and directions are right.

## 2026-09-19 – Bulk orders, higher Isp, time in the reward (version 21)
- Ships: the Holk is now hybrid (chemical/electric), Isp 600. The Hulk hybrid, Isp 650, tank 280 t.
  The Karacke tank 150 t instead of 90 t, so it stays the long-distance ship (Jupiter, Saturn). The
  Kogge unchanged (chemical, Isp 450). Note: a purely chemical drive cannot reach 600–650 s in
  reality (the maximum is about 460 s), hence "hybrid".
- Reward formula: a new time share K_ZT = 4 Cr per tonne (cargo + an 8 t ship share) and travel day.
  That makes Mars pay off for the Kogge about as well as the Moon does (around 140 Cr per day).
  Multi-year runs pay accordingly.
- Bulk orders: every producer fills a bulk store on the side (restocking 1.5× slower than single
  goods). Once the lot size is reached (7–18 containers), a bulk order appears with a 10% premium, a
  lifetime of 180 days and a deadline 60 days longer. Its destination is a post with demand, or a
  hub. At most one bulk order per producer and goods type is open at a time. After a year about 14
  are open, after four years about 26.
- Display: a "bulk order" tag on the order board. If it does not fit, it reads "needs 13 slots: Hulk
  or larger", plus a note at the top of the board. The shipyard shows per ship: "Opens up N bulk
  orders, worth X Cr together".
- "Too heavy" hint: if the delta-v is not enough even with a full tank, the order board and the route
  planner now say "too heavy, only X km/s even with a full tank" instead of "refuel first".
- Game bot run under the new rules: Holk after 10.2 years, Hulk after 16.1 years, Karacke after 27.4
  years (previously 95.8). Income 3.1 M Cr, fuel 1.1 M Cr (36% instead of 65%). No emergency
  refuelling, nothing delivered late.

## 2026-09-19 – Played through to the Karacke (version 20)
- Fixed: the dead end with no money. With 0 Cr at a fuel depot you counted as "not stranded" as soon
  as another post was reachable, even if no order there was feasible. The bot therefore waited
  forever. Now only whether the approach plus the order's route fit the fuel on board counts.
- Balance findings (old rules):
  - Run 1 (Holk as an intermediate step): Holk after 21 years, then a slide into bankruptcy. No
    Karacke after 60 years.
  - Run 2 (Kogge straight to the Karacke): Karacke after 95.8 years. Income 9.0 M Cr, of which 5.8 M
    Cr fuel (65%). Around 11,000 Cr profit per year.
  - 188 of 286 runs were Earth → Shackleton. Interplanetary runs were barely worth it.
  - Holk and Hulk made a loss on the Moon run with a typical load (an 8 t ship share in the reward,
    but 20 and 45 t of dry mass; only 1–3 containers per destination).
  - Open: Moon → Earth takes 43 days, because the route picks aerobraking (40 days, 60 m/s). The
    order board shows only the gross reward, not the net after fuel.

## 2026-09-19 – Restart fix and bot test (version 19)
- Restarting did not work: `confirm()` is blocked inside the embedded artifact page. Confirmation now
  happens in the menu by tapping a second time ("Really start over? Tap again").
- On mobile the map stayed blank after closing a panel, because it was drawn while hidden. Fixed. The
  ⓘ button was also sitting on top of the menu button.
- Save/load: falls back to session storage when the browser blocks localStorage.
- Refuelling on credit is only offered when the fuel on board is no longer enough for any order.
  Before that it was a debt trap.
- Route planner: if the route is too expensive there is now "To the nearest depot first". On a
  stranding warning the button reads "Start anyway".
- Test bot (a locked iframe as on claude.ai, desktop and phone): checks restart, save/load, waiting,
  the legend and the cargo tile. Then it plays 100–150 moves (orders, route links, autopilot,
  refuelling, hops, double clicks). Result: no JS errors, no NaN or negative values, no horizontal
  scrolling. The bot's bankruptcies come from its simple strategy (it flies to places without a depot
  with no reserve).

## 2026-09-19 – Notes implemented (version 18)
- Layout: title removed. Desktop: map on the left over the full height (no more scrolling), a narrow
  column on the right with 4 tiles (balance, Δv, cargo hold, ship) and below them the location or the
  panels. Mobile: a single column.
- The cargo hold is only a tile now; clicking it opens the hold. The ship gets its own tile, the fuel
  text is gone.
- An "always full" switch in the Δv tile: fills up automatically at every depot as far as the money
  goes (with the autopilot too).
- The legend moved behind an ⓘ button in the bottom right of the map. Messages appear as a brief
  overlay in the bottom left.
- Compact location card: the description next to the title, buttons with icons in one row (orders,
  refuel, shipyard).
- The message box, "individual manoeuvres and transfers" and the time buttons were removed from the
  page. A new menu (☰): save, load (1 slot), let time pass (+10/30/100 days, +1 year), start over.
- Double click or double tap on the map: look closer, or show the landing sites.
- Orders (on the board and in the hold) have a "Route" link to the route planner. Going back returns
  to the panel you came from.
- Route planner: "Next step only" leaves the window open. The autopilot leaves it open on desktop
  too; on mobile it returns to the map.
- The system view shows the ship under way between orbit and moons. The body view shows a landing or
  launch animation with an engine flame.
- Moons no longer spin wildly in a time lapse: during an animation they advance at most one lap and
  end at their real position.
- Ballistic hops between landing sites on the same body (landing sites now have longitudes). The
  minimum-energy ballistic path along the great circle. Without an atmosphere: 2·v. With one:
  proportional ascent losses, and the air helps braking. Earth: a suborbital flight on a launcher for
  40% of the launch fee. The saving depends on the distance: short hops are much cheaper, hops over
  90° only save 10–20%.
