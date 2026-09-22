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
| 4 | three.js typisieren | erledigt |
| 5 | `noUnusedLocals` / `noUnusedParameters` | erledigt |
| 6 | ID-Typen + `noUncheckedIndexedAccess` | **offen** |

Etappen 1–5 sind mit `npm test` gegen einen frischen Build geprüft (`errors: none`, `invariants: ok`). Etappe 3 zusätzlich mit einem alten Spielstand (deutsche IDs, fehlende Felder) und kaputten Spielständen, die abgelehnt werden müssen.

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

## Etappe 4: three.js – erledigt

- `@types/three@0.169` als devDependency, passend zur CDN-Version. `globals.d.ts` leitet das CDN-Modul mit `export * from 'three'` auf diese Typen um.
- `GL` ist nur noch der Status (`on`, `state`, `why`). Die Szene liegt im nicht exportierten `G: Scene3D|null`, das `glOff()` auf `null` setzt. Die exportierten Funktionen prüfen `G` statt `GL.on`.
- `glSaturnRing(d)` setzt Sichtbarkeit und Größe selbst, `draw.ts` fasst kein three.js-Objekt mehr an. `glPut` gibt nichts mehr zurück.
- Die Reihenfolge in `glInit` war unkritisch: Nur `glRocketGeo` läuft dort, und das braucht weder Renderer noch `aniso`. `glSurface`/`glRingTexture` laufen erst später aus `glMat`/`glSaturnRing`.
- **Testen mit 3D:** Hier im Container ist das CDN gesperrt, dann bleibt `GL.on` falsch und `gl.ts` läuft gar nicht. Zum Testen three.js lokal ausliefern (`npm pack three@0.169.0`, in Playwright `page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', …)` mit `access-control-allow-origin: *`). So geprüft: `rocket-images.js` mit `3D layer on: true`, Tests grün, Screenshots von Erde, Saturn-System und Saturn gleich wie vorher.

## Etappe 5: Ungenutzter Code – erledigt

`noUnusedLocals` und `noUnusedParameters` sind in `tsconfig.json` an. Die ungenutzten Importe sind entfernt, ebenso der Parameter `col` von `drawRocket` (und `v('--accent')` in den sechs Aufrufen in `draw.ts`). `allowJs` ist raus, denn `include` erfasst nur `.ts`.

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

- `tests/test-bot.js`: In etwa 1 von 5 Läufen bleibt der Bot für ein Gerät am Start hängen („0 flights, 0 deliveries … ended on day 30“). Das passiert schon vor Etappe 3 (`d7eb623`: 2 von 10 Läufen) und ist kein Testfehler im Sinne von `errors`/`invariants`, verdeckt aber einen Teil der Prüfung.

- `js/ui/display.ts:53` enthielt „Gesamt verbraucht“. Das ist in Etappe 0 übersetzt, weitere deutsche Reste mit `grep -rnE '[äöüß]|verbraucht|Jetzt' js` suchen. Deutsche Kommentare gibt es noch in `physics.ts` (Zeilen 49, 57–59) und `economy.ts:1`, außerdem Pfadnamen wie `'hoch'`, `'niedrig'`, `'mond:'` in `draw.ts`. Letztere sind nur interne Schlüssel.
