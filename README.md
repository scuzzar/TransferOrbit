# TransferOrbit

Prototyp eines Weltraum-Handelsspiels mit echter Bahnmechanik. Du fliegst Fracht zwischen Kontoren im Sonnensystem. Jede Fahrt kostet Delta-v nach der Raketengleichung, Transfers zu anderen Planeten gehen nur in Transferfenstern. Mit dem Gewinn kaufst du größere Schiffe: Kogge → Holk → Hulk → Karacke.

![Screenshot](docs/screenshot.png)

## Spielen
Mit GitHub Pages läuft das Spiel unter https://scuzzar.github.io/TransferOrbit/. Lokal braucht es einen Server (`npm run serve`, dann http://localhost:8765/) — das Spiel besteht aus ES-Modulen, und die lädt der Browser nicht über `file://`.

- Tippen oder Klicken auf Planeten, Monde und Landeplätze wählt ein Ziel. Ein Doppelklick zoomt hinein.
- Der Routenplaner berechnet die günstigste Route, auf Wunsch fliegt sie der Autopilot.
- Tippen während eines Fluges macht die Animation schneller.
- Das Menü (☰) enthält Speichern, Laden, Zeit vergehen lassen und Neustart.

## Darstellung
Die Himmelskörper zeichnet [three.js](https://threejs.org/), als ES-Modul vom CDN geladen; es liegt nichts davon im Repo und es gibt keine Baukette. Darüber liegt weiterhin ein durchsichtiger 2D-Canvas mit Beschriftungen, Bahnen, Markierungen, Flammen und den Klickzielen. Beide nutzen dieselbe orthografische Projektion, deshalb liegen sie deckungsgleich übereinander.

Reihenfolge der Ebenen: `#cvb` (2D, hinten) – `#glc` (three.js) – `#cv` bzw. `#sys` (2D, vorne).

In der 3D-Ebene liegen die Körper, der Saturnring, die Bahnringe, die Flugspuren und die Rakete — alles mit echter Tiefe, sie verdecken sich also gegenseitig pixelgenau. Im 2D-Canvas bleiben Beschriftungen, Markierungen, Flammen und die Klickziele.

**Keine fremden Texturen.** Die Oberflächen entstehen beim ersten Bedarf im Browser: Kontinente aus denselben handgezeichneten Umrissen wie bisher, Polkappen, die Bänder der Gasriesen und der Saturnring. Das Spiel lädt damit außer three.js selbst keine einzige Datei nach und läuft auch in einem gesperrten iframe.

**Kein Rückfall auf 2D.** Fehlt WebGL, geht der Kontext verloren oder lädt three.js nicht, bleibt das Kartenfeld leer und sagt das. Eine zweite, schlechtere Darstellung wäre irreführend: man sähe etwas und wüsste nicht, dass es nicht die eigentliche Ansicht ist. Aufträge, Routenplaner und Autopilot laufen in diesem Fall weiter, nur die Karte fehlt.

Flach bleiben nur die Draufsicht aufs Sonnensystem (`drawSol`) und, darin, die Rakete.

## Physik und Wirtschaft
- Delta-v nach Ziolkowski mit Leergewicht, Fracht und Treibstoff. Jedes Schiff hat einen eigenen Isp.
- Hohmann- bzw. Kepler-Transfers. Das nächste Fenster hängt von der echten Planetenstellung ab.
- Ballistische Hüpfer zwischen Landeplätzen, Aerobremsen bei Körpern mit Atmosphäre.
- Belohnung = K_T·m·(e^(Δv/v_e) − 1) + K_Z·Tage + K_ZT·m·Tage + 0,1·n·w (+ Anteil Startgebühr), mal einem Zufallsfaktor: meist 0,9–1,2, in 8 % der Fälle 1,4–1,9.
- Großaufträge (7–18 Container) passen nur in größere Schiffe.

## Aufbau des Repos
| Pfad | Inhalt |
|---|---|
| `index.html` | Markup und CSS, dazu eine Zeile: `<script type="module" src="./js/start.js">` |
| `js/` | das Spiel in 22 ES-Modulen. Der Browser lädt sie selbst, es gibt nichts zu bauen |
| `ARCHITEKTUR.md` | wie die Module geschnitten sind und welche zwei Regeln sie zusammenhalten, mit Komponentendiagramm |
| `CHANGELOG.md` | Änderungsprotokoll aller Versionen |
| `art/` | Modelle, Texturen und Bilder aus [Hanseatic Galaxy](https://github.com/scuzzar/HanseaticGalaxy), siehe `art/README.md` |
| `tools/` | Python-Werkzeuge: Testserver, Einzeldatei bauen, Godot-.escn → JSON, Modelle vereinfachen, Vorschau rendern |
| `tests/` | Playwright-Tests und Bots |

Kurz zum Aufbau, ausführlich in `ARCHITEKTUR.md`: Einfuhren gehen nur nach unten (`basis` → `spiel/…` → `karte/…` → `ui/…` → `start`), und nach oben wird gemeldet statt gerufen. Wer den Spielstand ändert, ruft `geaendert()`; wer nur die Zeit weiterdreht, `zeitLief()`. Die Anzeige trägt sich dafür ein, verbunden wird beides einzig in `js/start.js`. `window.TO` ist die Außenkante für Tests und Konsole.

Eine einzige HTML-Datei (für Artefakte oder Anhänge) baut `python3 tools/einzeldatei.py`.

## Tests
```bash
npm install            # Playwright
npx playwright install chromium
npm run serve          # in einem zweiten Terminal: Server auf Port 8765 (mit CORS-Kopf)
npm test               # Regressionstest + UI-Bot (Desktop und Handy)
npm run spiel-bot      # spielt klug bis zur Karacke und protokolliert die Balance
```
- `tests/regress.js` prüft Neustart, Speichern und Laden, Strand-Logik und Tanken im Routenplaner.
- `tests/test-bot.js` klickt sich durch die Oberfläche, in einem gesperrten iframe wie auf claude.ai (`tests/harness.html`). Einstellbar mit den Umgebungsvariablen `STEPS`, `ONLY` und `LOG`.
- `tests/spiel-bot.js` spielt über die Spielfunktionen, mit `ANIM.sofort` ohne Animationen.
- `tests/autopilot-ankunft.js`, `tests/rakete-bilder.js` und `tests/rakete-perf.js` sind Einzelprüfungen. Alle brauchen den laufenden Server.

## Herkunft der Art
Die 3D-Rakete im Spiel ist das Modell „SimpleRocket“ aus Hanseatic Galaxy, vereinfacht auf 608 Dreiecke. Die Planetentexturen kommen von I, Voyager (Apache 2.0) und Solar System Scope (CC BY). Die Lizenztexte liegen in `art/lizenzen/`.
