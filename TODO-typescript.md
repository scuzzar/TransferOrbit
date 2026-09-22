# TODO: TypeScript-Aufräumen

Arbeitsbranch: `typescript-cleanup`. Ziel: Den Code wirklich typgetrieben machen, statt `any` und Casts zu verwenden.
Diese Datei löschen, sobald alles erledigt ist.

## Stand

| Etappe | Inhalt | Status |
|---|---|---|
| 0 | Typen für `Move`, `Orbit`, `BodyPath`, `SysPlan`; Aerobrake-Bug behoben | erledigt, in `main` (`62f4d15`) |
| 1 | `Pick` als Union, `Hit` mit echten Feldern, überflüssige Casts entfernt, Fullscreen-Präfixe typisiert, `window.TO` deklariert | erledigt (`c88f54d`), getestet |
| 2 | `[k:string]:any` aus `LocalAction`, `Edge`, `PlanStep` entfernt; `PlanStep` als Union über `kind`; `RouteResult.legs` typisiert | erledigt (`c88f54d`), getestet |
| 3 | Spielstand validieren, `eco:null as any`, `flags` | erledigt |
| 4 | three.js typisieren | **offen** |
| 5 | `noUnusedLocals` / `noUnusedParameters` | **offen** |
| 6 | ID-Typen + `noUncheckedIndexedAccess` | **offen** |

Etappen 1–3 sind mit `npm test` gegen einen frischen Build geprüft (`errors: none`, `invariants: ok`). Etappe 3 zusätzlich mit einem alten Spielstand (deutsche IDs, fehlende Felder) und kaputten Spielständen, die abgelehnt werden müssen.

## Regeln und Stolpersteine

- **Importe zeigen nur nach unten** (siehe `ARCHITECTURE.md`). `game/state.ts` darf nichts aus `map/` importieren, auch keine reinen Typen. Deshalb liegen die Render-Typen (`Move`, `Orbit`, `SysPlan` …) in `state.ts`, und `map/geometry.ts` exportiert sie weiter.
- **Tests:** `npm test` baut zuerst (`pretest`) und startet dann `tests/regress.js` und `tests/test-bot.js` mit Playwright. Voraussetzung ist einmal `npx playwright install chromium`. Der Bot arbeitet mit Zufall; eine gemeldete Pleite („bankrupt at step N“) ist kein Testfehler. Entscheidend sind `errors: none` und `invariants: ok`.
- **`dist/index.html` ist eingecheckt**, und jeder Build überschreibt die Datei. Nicht mitcommitten, sondern mit `git checkout -- dist/index.html` zurücksetzen – aber erst **nach** den Tests, denn die laden genau diese Datei. Der GitHub-Pages-Workflow baut selbst.
- **Commits** gehen unter dem Namen des Nutzers raus, **ohne** `Co-Authored-By: Claude`-Zeile.
- **Stil:** Der Code ist sehr dicht geschrieben (viele Anweisungen pro Zeile, kurze Namen). Diesen Stil beibehalten und nicht umformatieren.
- Die Tests prüfen die Aerobraking-Animation nicht; das lässt sich nur im Browser sehen.

## Etappe 3: Spielstand und Zustand – erledigt

- `newGame()` setzt `eco:newEconomy()` direkt, kein `null as any` mehr.
- `Flags` in `state.ts` statt `Record<string,any>`. Gelesen werden die Flags nirgends, auch nicht in `tests/`.
- `parseSave(raw:unknown)` in `commands.ts` prüft den Spielstand aus `localStorage`: Pflichtfelder (`day`, `node`, `ship` ∈ `SHIPS`, `fuel`, `credits`), die Wirtschaft (`stock`/`fwd`/`demand` als Zahlentabellen, jeder Auftrag mit allen Feldern und bekannter Ware). Fehlende jüngere Felder (`used`, `autoFill`, `over`) bekommen Vorgaben, ein `target`, das kein String ist, wird `null`, unbekannte Flags fallen weg.
- `migrate()` arbeitet auf `Record<string, unknown>` und übersetzt jetzt auch die Landeplätze in den `refuel:`-Flags.
- Übrig bleibt ein Cast in `parseEco()`, nachdem alle Felder geprüft sind.

## Etappe 4: three.js

Dateien: `globals.d.ts`, `js/map/gl.ts`, `js/start.ts`, `package.json`

three.js wird zur Laufzeit per dynamischem `import()` vom CDN geladen (`three@0.169.0`, siehe `start.ts:44`) und ist nicht gebündelt. Im Moment ist alles `any`:
- `globals.d.ts:1-21` – beide `declare module`-Blöcke mit `const THREE: any`
- `gl.ts:22` – `export const GL: any = {...}`
- `gl.ts:48, 109, 126, 141` – `T:any`
- `start.ts:45` – `THREE as any`

Vorgehen:
- [ ] `npm i -D @types/three@0.169` (Version passend zum CDN).
- [ ] `globals.d.ts`: `declare module 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js' { export * from 'three'; }`. Den Block `declare module 'three'` entfernen, denn den liefert `@types/three`.
- [ ] `gl.ts`: `import type * as THREE from 'three'` und `type Three = typeof THREE`.
- [ ] `GL` aufteilen:
  - Status: `{ on:boolean; state:'loading'|'on'|'off'; why:string }`. Das bleibt exportiert, weil `draw.ts` `GL.on` liest, `start.ts` `GL.state` liest und `tests/rocket-images.js` `TO.GL.on` liest.
  - Die Szene kommt in ein eigenes, nicht exportiertes Objekt, etwa `let G: Scene3D|null`. Es enthält `T, r:WebGLRenderer, scene, cam:OrthographicCamera, root/flat:Group, sphere, plane, rocket:Mesh, qa/qb:Quaternion, AX/AY/AZ:Vector3, dl, amb, aniso, mat:Record<string,Material>, mesh:Record<string,Mesh>, path:Record<string,{gm,ghost,solid,cap}>, ring:Mesh|null`. `glOff()` setzt es auf `null`.
- [ ] Achtung: `glRocketGeo`, `glSurface` und `glRingTexture` werden in `glInit` aufgerufen, bevor `GL.r` bzw. `GL.aniso` gesetzt sind. Die Reihenfolge prüfen.
- [ ] `start.ts:45`: `.then((THREE) => Gl.glInit(THREE))` ohne Cast.

## Etappe 5: Ungenutzter Code

Danach `"noUnusedLocals": true, "noUnusedParameters": true` in `tsconfig.json` setzen. Aktuelle Fundstellen (`npx tsc --noEmit --noUnusedLocals --noUnusedParameters`):

- `js/game/commands.ts:6` – Import `Post`
- `js/game/planner.ts:4` – Import `FUEL_PRICE`
- `js/game/planner.ts:7` – Import `RouteResult`
- `js/game/planner.ts:8` – Import `LocalAction`
- `js/map/rocket.ts:2-4` – Importe `B`, `burn`, `sc`
- `js/map/rocket.ts:25` – Parameter `col` von `drawRocket` wird nie gelesen. Aus der Signatur entfernen und alle Aufrufe in `draw.ts` anpassen (dort steht jeweils `v('--accent')` an dieser Stelle).
- `js/ui/panels.ts:5` – Import `Post`
- `js/ui/panels.ts:6` – Import `Target`
- `js/ui/panels.ts:9` – Import `FuelSpot`

Weitere Kandidaten ohne Compiler-Hinweis: `tsconfig.json` hat `allowJs: true`, aber `include` erfasst nur `.ts`. Die Option entweder entfernen oder `tests/` bewusst mit prüfen.

## Etappe 6: ID-Typen und `noUncheckedIndexedAccess`

Der größte Brocken. `npx tsc --noEmit --noUncheckedIndexedAccess` meldet aktuell **452 Fehler**:

| Datei | Fehler |
|---|---|
| ui/panels.ts | 65 |
| map/draw.ts | 62 |
| game/economy.ts | 53 |
| game/commands.ts | 44 |
| map/geometry.ts | 36 |
| game/graph.ts | 29 |
| map/rocket.ts | 27 |
| game/state.ts | 27 |
| map/gl.ts | 26 |
| game/planner.ts | 22 |
| ui/pickcard.ts | 16 |
| game/actions.ts | 13 |
| game/physics.ts | 10 |
| map/view.ts | 8 |
| ui/display.ts | 7 |
| game/world.ts | 5 |
| map/canvas.ts | 2 |
| ui/widgets.ts, basics.ts | je 1 |

Das Flag einfach einzuschalten und überall `!` zu setzen, bringt nichts. Sinnvoll ist diese Reihenfolge:

- [ ] **Literal-IDs** in `world.ts`: Statt `B: Record<string, Body>` → `const B = {...} satisfies Record<string, Body>` und `type PlanetId = keyof typeof B`. Dasselbe für `M` (`MoonId`), `SHIPS` (`ShipId`), `GOODS` (`GoodId`), Post-IDs, `type BodyId = PlanetId|MoonId`, `type Level = 'surf'|'orbit'|'capt'`.
- [ ] **Knoten-Strings** wie `'earth.orbit'` werden überall mit `node.split('.')` zerlegt, was nur `string[]` liefert. Einen Helfer `splitNode(node): [BodyId, Level]` in `state.ts` (oder `world.ts`) einführen und `split('.')` damit ersetzen. Ebenso `here()`.
- [ ] Aufpassen bei `SITES`, `ROT` und `FUEL_PRICE`: Das sind echte Teil-Maps, nicht jeder Body hat einen Eintrag. Die bleiben `Partial<Record<…>>`, und die vorhandenen `||[]`- bzw. `??`-Abfragen sind dort korrekt.
- [ ] Erst danach `noUncheckedIndexedAccess` einschalten und den Rest mit echten Prüfungen beheben.
- [ ] `pickcard.ts` benutzt bereits `B[k]!` bzw. `M[m]!`. Diese `!` fallen mit den Literal-IDs weg.

Optional, ebenfalls in dieser Etappe: `string`-Felder, die eigentlich Unions sind:
- `UIState.view` (`'main'|'cargo'|'refuel'|'route'|…`, die Werte aus `openView`-Aufrufen sammeln)
- `route.mode` / `auto.mode` / `planRoute(mode)` → `'eco'|'now'`
- `DomainState.ship` → `ShipId`
- `rocketMode` in `rocket.ts` → `'gl'|'flat'`
- `drawRocket(burn, soon)` → `'pro'|'retro'|null`

## Nebenbei gefunden (nicht TypeScript)

- `js/ui/display.ts:53` enthielt „Gesamt verbraucht“. Das ist in Etappe 0 übersetzt, weitere deutsche Reste mit `grep -rnE '[äöüß]|verbraucht|Jetzt' js` suchen. Deutsche Kommentare gibt es noch in `physics.ts` (Zeilen 49, 57–59) und `economy.ts:1`, außerdem Pfadnamen wie `'hoch'`, `'niedrig'`, `'mond:'` in `draw.ts`. Letztere sind nur interne Schlüssel.
