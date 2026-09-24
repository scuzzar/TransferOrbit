# TransferOrbit

Prototype of a space trading game with real orbital mechanics. You fly cargo between trading posts across the solar system. Every move costs delta-v according to the rocket equation, and transfers to other planets are cheapest inside a transfer window; flying faster or outside it costs more. With the profit you buy larger ships with better drives: Cog (solid-core fission, 900 s) → Hulk (liquid-core fission, 1500 s) → Galleon (gas-core fission, 2500 s) → Carrack (fusion, 4000 s).

![Screenshot](docs/screenshot.png)

## Playing
With GitHub Pages the game runs at https://scuzzar.github.io/TransferOrbit/. Locally it needs a server (`npm run serve`, then http://localhost:8765/) — the game is made of ES modules, and browsers do not load those over `file://`.

- Tapping or clicking a planet, moon or landing site selects a target. A double click zooms in.
- The route planner drafts a plan step by step from one of three presets: *economical* saves
  propellant wherever it can, *fast* buys time with it as far as the tank allows, *balanced* sits
  between. Then every step can be changed: a transfer's departure day and flight time are picked on
  a map of what it costs, and where aerobraking and burning lead to the same orbit you choose which.
  The rest of the route is planned again around your choices. The autopilot flies the plan.
- Tapping during a flight speeds the animation up.
- The menu (☰) holds save, load, letting time pass, and restart.

## Rendering
The celestial bodies are drawn by [three.js](https://threejs.org/), loaded as an ES module from a CDN; none of it lives in the repository and there is no toolchain. On top of it sits a transparent 2D canvas with labels, orbits, markers, flames and the hit targets. Both use the same orthographic projection, which is why they line up exactly.

Order of the layers: `#cvb` (2D, behind) – `#glc` (three.js) – `#cv` or `#sys` (2D, in front).

The 3D layer holds the bodies, Saturn's ring, the orbit rings, the flight paths and the rocket — all with real depth, so they hide each other pixel by pixel. The 2D canvas keeps labels, markers, flames and the hit targets.

**No foreign textures.** The surfaces are built in the browser when first needed: continents from the same hand-drawn outlines as before, polar caps, the bands of the gas giants and Saturn's ring. Apart from three.js itself the game therefore loads not a single file, and it runs inside a locked iframe.

**No fallback to 2D.** If WebGL is missing, the context is lost or three.js does not load, the map area stays empty and says so. A second, poorer rendering would be misleading: you would see something without knowing it is not the real view. Orders, route planner and autopilot keep working in that case, only the map is gone.

The only things that stay flat are the top-down view of the solar system (`drawSol`) and, within it, the rocket.

## Physics and economy
- Delta-v after Tsiolkovsky with dry mass, cargo and propellant. Every ship has its own Isp.
- Transfers between planets as a Lambert problem on circular orbits: what one costs follows from the angle it sweeps and its flight time, so leaving on a different day or flying faster costs more, as it would for real. The Hohmann window is the cheapest case. Every pair of planets has a transfer table of these costs (`npm run tables` computes them); a transfer burns the exact value.
- Ballistic hops between landing sites, aerobraking at bodies with an atmosphere.
- Reward = RATE_MASS·m·(e^(Δv/v_e) − 1), with v_e the Cog's exhaust velocity, + RATE_DAY·days + RATE_MASS_DAY·m·days + 0.1·n·w (+ a share of the launch fee), times a luck factor: usually 0.9–1.2, in 8% of cases 1.4–1.9.
- Bulk orders (7–18 containers) only fit into larger ships.

## Layout of the repository
| Path | Contents |
|---|---|
| `index.html` | markup and CSS, plus one line: `<script type="module" src="./js/start.js">` |
| `js/` | the game in 28 ES modules. The browser loads them itself, there is nothing to build |
| `ARCHITECTURE.md` | how the modules are cut and which two rules hold them together, with a component diagram |
| `CHANGELOG.md` | the change log of every version |
| `art/` | models, textures and images from [Hanseatic Galaxy](https://github.com/scuzzar/HanseaticGalaxy), see `art/README.md` |
| `tools/` | Python tools: test server, single-file build, component diagram, Godot .escn → JSON, mesh decimation, preview rendering; `transfertables.js` (Node) computes the transfer tables |
| `tests/` | Playwright tests and bots |

The short version, spelled out in `ARCHITECTURE.md`: imports only ever point downwards (`basics` → `game/…` → `map/…` → `ui/…` → `start`), and upwards you report instead of calling. Whatever changes the game state calls `changed()`; whatever only advances time calls `tick()`. The display subscribes for both, and the two sides are connected in `js/start.js` alone. `window.TO` is the outside edge for tests and for the console.

A single HTML file (for artifacts or attachments) is built by `python3 tools/singlefile.py`.

## Tests
```bash
npm install            # Playwright
npx playwright install chromium
npm run serve          # in a second terminal: server on port 8765 (with the CORS header)
npm run typecheck      # tsc --noEmit
npm run unit           # unit tests of the game objects, no browser or server needed
npm test               # build, then unit tests, regression test + 5 UI bots (desktop and phone)
npm run game-bot       # plays sensibly up to the Carrack and logs the balance
```
The tests load the built `dist/index.html`. It is checked in, and every build rewrites it; the Pages workflow builds its own, so reset it with `git checkout -- dist/index.html` once the tests are through rather than committing it. The bot plays with chance: a reported bankruptcy is not a failure, `errors: none` and `invariants: ok` are what count. Without network access three.js does not load and the 3D code does not run at all (`TO.GL.on` stays false); to test it anyway, serve `three@0.169.0` locally, for instance through Playwright's `page.route` with an `access-control-allow-origin: *` header.
- `tests/unit.js` tests the game objects in `js/game/state.ts`, reading saves (old ones too) and the commands that drive them. It compiles `js/` with `tsc` into a temporary folder and runs under `node --test`, with `ANIM.instant` and a seeded `Math.random`.
- `tests/regress.js` checks restart, save and load, the stranding logic, refuelling in the route planner and that the two route modes really do differ.
- `tests/test-bot.js` clicks its way through the interface, inside a locked iframe like the one on claude.ai (`tests/harness.html`). Five bots play side by side, desktop and phone taking turns, each from a random trading post. three.js in software rendering is what makes it slow, so only the first bot draws in 3D. Configurable with the environment variables `RUNS` (default 5), `STEPS` (default 120), `ONLY` (`desk` or `mob`), `START` (a post id instead of a random one), `GL=all` (3D for every bot) and `LOG`.
- `tests/game-bot.js` plays through the game functions, with `ANIM.instant` and no animations.
- `tests/autopilot-arrival.js`, `tests/rocket-images.js` and `tests/rocket-perf.js` are single checks. All of them need the server running.

## Where the art comes from
The 3D rocket in the game is the "SimpleRocket" model from Hanseatic Galaxy, simplified to 608 triangles. The planet textures come from I, Voyager (Apache 2.0) and Solar System Scope (CC BY). The licence texts are in `art/licences/`.

## Licence
The game — everything in `index.html`, `js/`, `tools/` and `tests/` — is under the [MIT licence](LICENSE): use it, change it, build on it, sell it, as long as the copyright notice travels with it.

`art/` is not mine to license that way. The models come from [Hanseatic Galaxy](https://github.com/scuzzar/HanseaticGalaxy), the planet textures from I, Voyager (Apache 2.0) and Solar System Scope (CC BY); their terms and the attributions are in `art/licences/`. The game itself loads none of them — the surfaces are drawn in the browser — so the MIT part runs on its own.
