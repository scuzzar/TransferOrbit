# Architektur

Das Spiel besteht aus 22 ES-Modulen unter `js/`. Der Browser lädt sie selbst,
es gibt keine Baukette und kein `node_modules` im Auslieferstand. `index.html`
enthält nur noch Markup und CSS und zieht eine einzige Zeile Javascript:

```html
<script type="module" src="./js/start.js"></script>
```

Wer eine einzige Datei braucht (Artefakt, Anhang), baut sie mit
`python3 tools/einzeldatei.py`. Das Spiel selbst braucht das nie.

![Komponentendiagramm: 22 Module in sieben Schichtbändern, Einfuhren nur nach unten,
der Rückweg nach oben nur über die zwei Signale](docs/komponenten.svg)

<sub>Jedes Modul darf aus jeder Schicht unter sich einführen, nie umgekehrt. Der einzige Weg
zurück nach oben sind die zwei Signale, die `js/ereignisse.js` verteilt und die `js/start.js`
einmal verbindet. Die gezeichnete Reihenfolge ist eine gültige Ordnung, keine erzwungene: vieles,
was nebeneinander steht, ist voneinander unabhängig. Erzeugt mit `python3 tools/diagramm.py`.</sub>

## Die zwei Regeln

Alles andere folgt aus diesen beiden Sätzen.

**1. Einfuhren gehen nur nach unten.** Die Module stehen in einer festen
Reihenfolge (die Tabelle weiter unten). Ein Modul darf nur aus Modulen einführen,
die vor ihm stehen. Damit gibt es keine Kreise, jede Datei lässt sich von oben
nach unten lesen, und beim Zusammenfügen zu einer Datei ist die Reihenfolge
schon bekannt.

**2. Nach oben wird gemeldet, nicht gerufen.** Die Steuerung darf die Anzeige
nicht kennen — sonst wäre Regel 1 verletzt. Statt `render()` zu rufen, meldet
sie, dass sich etwas geändert hat. Wer darauf reagieren will, hat sich vorher
eingetragen.

```js
// js/ereignisse.js — das einzige Modul ganz unten
export function beiAenderung(fn)   // Anzeige trägt sich ein
export function beiZeit(fn)
export function geaendert()        // "der Spielstand hat sich geändert"
export function zeitLief()         // "nur die Zeit ist weitergelaufen"
```

Zwei Signale, weil es zwei sehr verschiedene Fälle gibt:

| Signal | Wann | Was daran hängt |
|---|---|---|
| `geaendert()` | Eine Aktion, ein Kauf, eine Ankunft — alles, was den Spielstand ändert | vollständiger Aufbau: Kopfzeile, Karte, Tafeln, danach Sichern |
| `zeitLief()` | Jedes Bild einer laufenden Animation | Kopfzeile und Karte, sonst nichts |

Der Unterschied ist nicht kosmetisch: Während eines Fluges läuft `zeitLief()`
sechzigmal in der Sekunde. Würde da der volle Aufbau laufen, würde bei jedem
Bild das HTML der offenen Tafel neu gebaut und der Spielstand in den
`localStorage` geschrieben.

Verbunden werden beide Seiten an genau einer Stelle, in `js/start.js`:

```js
Ereignisse.beiAenderung(()=>{ Anzeige.render(); Steuerung.save(); });
Ereignisse.beiZeit(()=>{ Anzeige.header(); Anzeige.speedHint(); Zeichnen.draw(); });
```

Das ist die ganze Kopplung zwischen Spiel und Oberfläche. Nur `start.js` weiß,
dass es beides gibt.

## Warum kein vollständiges MVC

Es gibt eine benannte Steuerung (`spiel/steuerung.js`) und einen Beobachter,
aber keine passiven Ansichten. Die Tafeln in `ui/panels.js` hängen ihre
`onclick` direkt an die Kommandos:

```js
btn('Abliefern', 'go', gesperrt, deliverAll)
```

Der Umweg über Absichten („die Tafel meldet `{art:'abliefern'}`, die Steuerung
entscheidet") hätte für jedes Kommando eine zusätzliche Marke gebraucht,
ohne dass irgendwo etwas einfacher geworden wäre: Die Tafeln sind die einzigen
Aufrufer, und ein falscher Aufruf fällt sofort auf. Der Gewinn des Beobachters
liegt in der anderen Richtung — die Steuerung soll nichts von der Anzeige
wissen —, und die ist vollständig umgesetzt.

## Die Schichten

Von unten nach oben. „Einfuhren aus" nennt nur die tatsächlich benutzten Module.

| # | Modul | Zeilen | Wofür | Einfuhren aus |
|--:|---|--:|---|---|
| 0 | `ereignisse.js` | 15 | Die zwei Signale | — |
| 1 | `basis.js` | 33 | Zahlen, Datum, Winkel, `$`, `ANIM` | — |
| 2 | `spiel/welt.js` | 197 | Körper, Monde, Landeplätze, Kontore, Waren | — |
| 3 | `spiel/physik.js` | 90 | Ziolkowski, Kepler, Hohmann, Hüpfer | basis, welt |
| 4 | `spiel/zustand.js` | 55 | `S` und die Abfragen darauf | welt |
| 5 | `spiel/graph.js` | 78 | Idealisierte Kosten für die Preisbildung | physik, welt, zustand |
| 6 | `spiel/wirtschaft.js` | 108 | Auftragsbörse, Fristen, Massengut | basis, graph, physik, welt, zustand |
| 7 | `spiel/aktionen.js` | 62 | Welche Manöver von hier aus gehen | physik, welt, zustand |
| 8 | `karte/geometrie.js` | 182 | Wo etwas auf dem Bildschirm liegt | basis, physik, welt, zustand |
| 9 | `spiel/planer.js` | 88 | Wegsuche für den Spieler, datumsabhängig | basis, aktionen, graph, physik, welt, zustand |
| 10 | `spiel/steuerung.js` | 333 | **Alle Kommandos.** Ändert `S`, meldet `geaendert()` | ereignisse, basis, geometrie, aktionen, graph, physik, planer, welt, wirtschaft, zustand |
| 11 | `karte/leinwand.js` | 56 | Die drei Zeichenebenen und ihre Hilfen | basis, welt, zustand |
| 12 | `karte/raketendaten.js` | 19 | Das Raketenmodell als Zahlenfeld | — |
| 13 | `karte/gl.js` | 288 | Die three.js-Ebene | ereignisse, basis, geometrie, leinwand, raketendaten, welt |
| 14 | `karte/rakete.js` | 76 | Lage, Flamme, 3D-Modell oder Handzeichnung | basis, gl, leinwand, raketendaten, welt, zustand |
| 15 | `karte/ansicht.js` | 87 | Welche Ebene die Karte zeigt; Klicks darauf | ereignisse, basis, leinwand, planer, welt, zustand |
| 16 | `karte/zeichnen.js` | 301 | Sonne, System, Körper — und `draw()` | basis, ansicht, geometrie, gl, leinwand, rakete, raketendaten, physik, welt, zustand |
| 17 | `ui/bausteine.js` | 40 | Knopf, Symbol, Chip, Überschrift | basis, steuerung, welt, zustand |
| 18 | `ui/panels.js` | 315 | Kontor, Fracht, Tanken, Werft, Route | ereignisse, basis, graph, planer, steuerung, welt, wirtschaft, zustand, bausteine |
| 19 | `ui/anzeige.js` | 146 | Kopfzeile, Meldung, Autopilotleiste, `render()` | ereignisse, basis, ansicht, leinwand, zeichnen, graph, physik, planer, steuerung, welt, zustand, bausteine, panels |
| 20 | `ui/menue.js` | 71 | Menü, Vollbild, Legende, Versionszeile | ereignisse, basis, zeichnen, steuerung, zustand |
| 21 | `start.js` | 56 | Verbinden, verdrahten, laden, `window.TO` | alle |

### Die Stellen, an denen die Reihenfolge nicht offensichtlich ist

**`spiel/steuerung.js` steht unter der Karte und unter der Oberfläche, nicht
darüber.** Ein Kommando wie „landen" braucht Geometrie (wo verläuft die
Flugbahn), und die Tafeln brauchen die Kommandos. Beides gleichzeitig geht nur,
wenn die Steuerung zwischen Geometrie und Oberfläche liegt. Möglich ist das,
weil sie die Anzeige dank Regel 2 gar nicht mehr braucht.

**`spiel/aktionen.js` ist von `spiel/steuerung.js` getrennt.** `localActions()`
sagt nur, was ginge; `doAction()` tut es. Die Trennung ist nötig, weil der
Planer (9) die Liste der Manöver braucht, aber unter der Steuerung (10) liegt.

**`karte/leinwand.js` liegt unter `karte/gl.js`.** Die three.js-Ebene muss
wissen, wie groß das Kartenfeld gerade ist, und sie schreibt ihre Meldungen
(„wird geladen", „kein WebGL") auf den 2D-Canvas. Die Zeichner selbst
(`drawSol`, `drawSys`, `drawBody`, `draw`) liegen dagegen über der GL-Ebene, weil
sie beide Welten bedienen.

**`karte/ansicht.js` liegt unter `karte/zeichnen.js`.** `mapView()` ist reiner
Zustand („welche Ebene zeigt die Karte gerade"), und `draw()` fragt ihn zuerst.
Die Klickbehandlung liegt im selben Modul, weil ein Klick auf die Karte genau
diesen Zustand ändert.

**`karte/` ist keine eigene Welt neben `ui/`, sondern die andere Hälfte derselben.**
Beides ist Darstellung; der Unterschied ist nur, worauf gezeichnet wird — Canvas oder DOM.
Der Code zeigt das deutlich: `karte/` führt nirgends aus `ui/` ein, und `ui/bausteine.js`
und `ui/panels.js` führen nirgends aus `karte/` ein. Die beiden Hälften kennen einander
nicht. Zusammen kommen sie erst in `ui/anzeige.js` (`render()` ruft `draw()`) und in
`ui/menue.js` (Vollbild zeichnet die Karte neu). Die Trennung in zwei Ordner ist also eine
Sache der Technik, nicht der Zuständigkeit.

Die eine Ausnahme ist `karte/geometrie.js`: Es steckt im Ordner `karte/`, ist aber keine
Darstellung, sondern Mathematik — wo ein Körper steht, wie eine Flugbahn verläuft. Deshalb
darf `spiel/steuerung.js` es einführen, obwohl es sonst nichts aus der Karte kennt.

**`ui/panels.js` liegt unter `ui/anzeige.js`.** `render()` entscheidet, ob eine
Tafel oder die Hauptansicht sichtbar ist, und baut die Tafel dann auf.

## Drei Bindungen, die nicht einfach umgehängt werden können

ES-Module erlauben es nicht, eine eingeführte Bindung von außen neu zu setzen.
Drei Stellen im alten Skript taten genau das; sie haben jetzt eine benannte
Schnittstelle:

| Bisher | Jetzt | Warum |
|---|---|---|
| `S = {...}` in `newGame`/`load` | `setzeStand(neu)` in `spiel/zustand.js` | `S` bleibt eine lebende Bindung: alle Module sehen den neuen Stand sofort |
| `HITS = []`, `HITS = HITS.filter(...)` | `hitsLeeren([ebene])` in `karte/leinwand.js` | `HITS` ist jetzt `const` und wird an Ort und Stelle geleert |
| `rocketMode = 'flach'` aus dem Zeichner | `setzeRaketenart(art)` in `karte/rakete.js` | dasselbe in Grün |

## Verdrahtung

Jedes Modul, das eigene DOM-Ereignisse braucht, hängt sie selbst an — in einer
Funktion, die `start.js` einmal ruft:

```js
Ansicht.verdrahteKarte();       // Klicks auf die beiden Karten-Canvas
Zeichnen.verdrahteZeichnen();   // Fenstergröße, Farbschema-Wechsel
Anzeige.verdrahteAnzeige();     // Tippen beschleunigt die Animation
Menue.verdrahteMenue();         // Menü, Warten, Legende, Vollbild, Version
```

So steht jeder Ereignisfaden neben dem Code, den er anstößt, und `start.js`
bleibt eine Seite lang lesbar.

## `window.TO` — die Außenkante

`start.js` legt aus allen Modulen eine einzige flache Schnittstelle an:

```js
window.TO.S             // der Spielstand, immer der aktuelle
window.TO.doAction(a)   // jedes ausgeführte Kommando
window.TO.geaendert()   // neu aufbauen und sichern
window.TO.modul['karte/gl']   // ein ganzes Modul, wenn man genauer hinsehen will
```

Die Einträge sind Lesezugriffe auf den jeweiligen Namensraum, keine Kopien —
`TO.S` zeigt also auch nach einem Neustart auf den richtigen Spielstand. Das
Spiel selbst benutzt `TO` nirgends; es gibt sie für die Tests und für die
Konsole. Damit ist die Liste der Ausfuhren zugleich die Liste dessen, was von
außen erreichbar ist.

## Nachladen von three.js

`start.js` holt three.js erst, nachdem das erste Bild steht, und mit einem
dynamischen `import()`:

```js
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js')
  .then(THREE => Gl.glInit(THREE))
  .catch(e => Gl.glOff(...));
setTimeout(()=>{ if(Gl.GL.state==='laden') Gl.glOff('three.js ließ sich nicht laden.'); }, 10000);
```

Eine feste Einfuhr oben in der Datei würde das ganze Spiel mitreißen, wenn das
CDN gesperrt ist. So bleiben Aufträge, Routenplaner und Autopilot benutzbar und
nur das Kartenfeld sagt, dass es nicht geht.

## Was sich durch die Aufteilung geändert hat

* `file://` funktioniert nicht mehr. ES-Module werden mit CORS geholt, und eine
  Datei vom Dateisystem hat keinen Ursprung, mit dem das geht. Über GitHub Pages
  oder jeden anderen Server läuft alles wie vorher.
* Der lokale Testserver muss `Access-Control-Allow-Origin: *` schicken, weil die
  Testhülle das Spiel in einen `sandbox="allow-scripts"`-Rahmen steckt — ein
  solcher Rahmen hat einen undurchsichtigen Ursprung, und die Module werden dann
  als fremd behandelt. Dafür gibt es `tools/serve.py` (`npm run serve`).
  GitHub Pages schickt den Kopf von sich aus.
* Die Tests sprechen das Spiel über `TO.*` an statt über globale Namen.

Am Spiel selbst hat sich nichts geändert: gleiche Physik, gleiche Wirtschaft,
gleicher Routenplaner, gleiche Darstellung.
