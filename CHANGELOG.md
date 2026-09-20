# Transferfenster – Änderungsprotokoll

Spielbare Version im Repo: `index.html`. Tests liegen in `tests/`, die Art in `art/`.

## 2026-09-20 – Pick-Karte als eigenes Modul, toter Code raus (Version 41)

`ui/anzeige.js` sollte der Rahmen sein — Kopfzeile, Meldung, Autopilotleiste und `render()`. Darin
steckte aber auch `renderPick()`, die Karte zum ausgewählten Kartenobjekt: 59 von 145 Zeilen, und
allein sie brauchte 25 der 47 Namen, die das Modul einführte. Nur deswegen hing `ui/anzeige.js` an
`spiel/physik`, `spiel/graph` und `karte/ansicht`.

`renderPick()` steht jetzt in `ui/pickkarte.js` (72 Zeilen). Es ist eine Tafel wie jede andere, nur
im Hauptbild statt im Panel — es gehört neben `renderPlace()`. `ui/anzeige.js` schrumpft auf 67
Zeilen und 22 eingeführte Namen.

`actionTags()` ist ersatzlos gelöscht: 14 Zeilen, die nirgends aufgerufen wurden. Das war schon im
alten Einzelskript so; die Modulaufteilung hat es nur sichtbar gemacht.

`tools/diagramm.py` liest Zeilenzahl, Modulzahl und Versionsnummer jetzt aus `js/`, statt sie in
einer Tabelle mitzuführen. Damit kann das Diagramm bei den Zahlen nicht mehr veralten.

Am Spiel ändert sich nichts.

## 2026-09-20 – Das Spiel liegt jetzt in Modulen (Version 40)

`index.html` war eine Datei mit 2.645 Zeilen, davon 2.242 in einem einzigen `<script>`. Daran ließ
sich kaum noch etwas ändern, ohne alles zu lesen. Das Skript steckt jetzt in 22 ES-Modulen unter
`js/`; `index.html` hat nur noch Markup, CSS und eine Zeile:

```html
<script type="module" src="./js/start.js"></script>
```

Zwei Regeln halten das zusammen, ausführlich beschrieben in `ARCHITEKTUR.md`:

1. **Einfuhren gehen nur nach unten.** Die Module stehen in einer festen Reihenfolge, keine Kreise.
2. **Nach oben wird gemeldet, nicht gerufen.** Statt `render()` zu rufen, meldet die Steuerung
   `geaendert()` (Spielstand hat sich geändert) oder `zeitLief()` (nur die Zeit lief weiter). Die
   Anzeige trägt sich dafür ein. Verbunden wird beides an genau einer Stelle, in `js/start.js`.

Dadurch kennt kein Spielmodul mehr die Oberfläche. Die Steuerung (`spiel/steuerung.js`) sammelt
alles, was den Spielstand ändert; alles, was nur fragt, liegt darunter.

Neu dabei:

- `window.TO` ist die einzige Außenkante: jeder ausgeführte Name aus jedem Modul, als Lesezugriff,
  dazu `TO.modul['karte/gl']` für ein ganzes Modul. Die Tests benutzen sie statt globaler Namen.
- `tools/serve.py` (`npm run serve`) schickt `Access-Control-Allow-Origin: *`. Die Testhülle steckt
  das Spiel in einen `sandbox="allow-scripts"`-Rahmen; ein solcher Rahmen hat einen undurchsichtigen
  Ursprung, und ohne den Kopf lehnt der Browser die Module ab. GitHub Pages schickt ihn von sich aus.
- `tools/einzeldatei.py` baut aus `js/` wieder eine einzige HTML-Datei, für Artefakte und Anhänge.
- `ANIM.sofort` überspringt Animationen. Der Spiel-Bot hat dafür bisher `animateTo` überschrieben,
  was mit Modulen nicht mehr geht.
- `bewegungPlanen(a)` ist aus `doAction` herausgelöst: ein Zug lässt sich damit aufbauen, ohne ihn
  ablaufen zu lassen. `tests/rakete-bilder.js` bildet damit die einzelnen Phasen ab.
- `RAKETE_ZULETZT` merkt sich, wo die Rakete zuletzt gezeichnet wurde.

`file://` funktioniert nicht mehr: ES-Module werden mit CORS geholt, und eine Datei vom
Dateisystem hat keinen Ursprung, mit dem das geht. Über GitHub Pages läuft alles wie vorher.

Am Spiel selbst hat sich nichts geändert – gleiche Physik, gleiche Wirtschaft, gleicher
Routenplaner, gleiche Darstellung.

## 2026-09-20 – 2D- und 3D-Ebene fest aneinander gekoppelt (Version 39)

Die 3D-Kugel saß gegenüber Gitter und Beschriftung versetzt, sobald die Autopilotleiste über der
Karte erschien. Gemessen waren es 38 px senkrecht.

- **Ursache:** `#cv` ist ein Flex-Kind der Bühne und wird zentriert, wandert also, wenn sich die
  Bühne ändert. Die Ebenen `#cvb` und `#glc` lagen dagegen absolut auf Koordinaten, die beim
  letzten Zeichnen gemessen wurden. `render()` ruft `draw()` **vor** `renderAutobar()`; erscheint
  die Leiste, ändert sich das Layout also nach dem Zeichnen, und niemand misst nach.
- **Behoben nicht durch Nachmessen, sondern baulich:** alle vier Canvas stecken jetzt in einem
  gemeinsamen Kasten `.cwrap`. Der Kasten ist das Element, das die Bühne zentriert, der vordere
  Canvas gibt ihm seine Größe, und die hinteren Ebenen liegen in seiner linken oberen Ecke. Damit
  sind sie von selbst deckungsgleich, unabhängig davon, wann gezeichnet wird.
- `layFor` setzt nur noch die Größe; die Lage kommt aus dem Kasten.

## 2026-09-20 – Versionsnummer im Menü (Version 38)

- Unten im Menü steht jetzt „Version NN · Stand TT.MM.JJJJ, hh:mm". Das Datum kommt aus
  `document.lastModified`, also dem Stand der tatsächlich ausgelieferten Datei. Zeigt es ein altes
  Datum, liegt eine veraltete Fassung im Browser-Cache — GitHub Pages setzt `max-age=600`, hält
  `index.html` also zehn Minuten. Ein harter Neuladen (Strg+Umschalt+R) holt sie sofort.
- Die Nummer steht in der Konstanten `VERSION` gleich oben bei `START_DAY` und wird bei jeder
  neuen Version mitgezogen.

## 2026-09-20 – Bahnen in 3D, echte Tiefe für die Rakete (Version 37)

Drei Fehler mit derselben Wurzel: Bahnen und Rakete lagen in verschiedenen Ebenen und konnten sich
deshalb nicht gegenseitig verdecken.

- **Bahnringe und Flugspuren liegen jetzt in der 3D-Ebene.** Vorher wurden sie auf den vorderen
  2D-Canvas gezeichnet, der über der 3D-Ebene liegt — die Bahn lief also quer über die Rakete.
  WebGL kann Linien nicht verbreitern (immer 1 px), deshalb sind es schmale Bänder aus Dreiecken:
  gleiche Breite und Strichelung wie bisher, gerechnet in Bildschirmkoordinaten plus Tiefe, also
  mit derselben Projektion wie der 2D-Weg. Zwei Durchgänge halten die bisherige Optik: blass ohne
  Tiefentest (die Rückseite scheint gedämpft durch den Körper), darüber voll mit Tiefentest.
- **Die Rakete steht auf ihrer echten Tiefe** statt pauschal vor allem. Vorher war sie entweder
  ganz vorn oder ganz weg, je nachdem, ob ihr Mittelpunkt hinter dem Körper lag; am Rand sprang
  sie deshalb. Jetzt verdeckt der Körper sie pixelgenau.
- **Auf der Oberfläche stehend kommt sie vor die ganze Kugel.** Die Tiefe der Oberfläche am
  Fußpunkt zu nehmen genügt nicht: die Kugel wölbt sich über die 22 px Breite der Rakete hinweg
  und verdeckte ihre innere Hälfte — nach der Landung steckte sie halb im Planeten.
- Die Deckkraft beim Verlassen eines Mondorbits (`fade`) wirkt wieder auf die Rakete; sie hing
  vorher am 2D-Kontext und lief damit an der 3D-Rakete vorbei.

## 2026-09-20 – Kein Rückfall auf 2D mehr (Version 36)

Die Körperansicht und die Systemansicht gibt es nur noch in 3D. Läuft three.js nicht, bleibt das
Kartenfeld leer und nennt den Grund, statt heimlich eine zweite, schlechtere Darstellung zu zeigen.

- **Entfernt:** `shadeSphere`, die 2D-Kugel mit Grundfarbe, die Kontinente als Polygone auf der
  Kugel (`surfPoly`), die gemalten Polkappen, der Terminator als Halbellipse, die Randverdunklung,
  der 2D-Saturnring und die 2D-Bänder der Gasriesen. Die Daten dahinter (`LAND`, `WATER`, `DESERT`,
  `CAPS`) bleiben, denn aus ihnen entstehen jetzt die Karten für three.js.
- **Statt des Rückfalls ein Hinweis** auf dem Kartenfeld: „Diese Karte braucht WebGL", dazu der
  Grund und der Hinweis, dass Aufträge, Routenplaner und Autopilot weiterlaufen. Während three.js
  lädt, steht dort „3D-Ansicht wird geladen …". Kommt das Modul gar nicht an, schaltet eine
  Zeitschranke nach 10 Sekunden auf die Fehlermeldung um, damit es nicht ewig beim Laden bleibt.
- Der Schalter `use3D` ist einem klaren Raketenmodus gewichen: `gl` für das three.js-Modell,
  `flach` für den 2D-Handrenderer (Sonnenansicht und die blasse Rückseite eines Landeplatzes),
  `keine` für die Rakete hinter dem Körper, wo nur Flamme und Steuerdüsen zählen.
- Flach bleiben weiterhin die Draufsicht aufs Sonnensystem und die Rakete darin; `rocketMesh` wird
  dafür gebraucht und bleibt.

## 2026-09-20 – Oberflächen ohne fremde Texturen (Version 35)

Version 34 lud Planetentexturen aus `art/texturen/`. Die bleiben liegen, werden aber nicht mehr
benutzt: das Spiel zeichnet die Oberflächen selbst.

- **Karten entstehen im Browser**, equirektangular auf 1024×512, beim ersten Bedarf eines Körpers:
  Erde aus denselben handgezeichneten Umrissen wie die 2D-Ansicht (`LAND`, `WATER`, Wüstengürtel),
  dazu Polkappen aus `CAPS` und für Jupiter und Saturn die vier Bänder, die vorher die
  2D-Schattierung malte. Körper ohne Besonderheiten bekommen gar keine Karte, für sie genügt
  die Grundfarbe. Der Saturnring wird ebenfalls gezeichnet, mit der Cassini-Teilung.
- **Damit lädt die 3D-Ebene keine einzige Datei mehr** außer three.js selbst. Das behebt auch, warum
  sie im Artefakt auf claude.ai bisher gar nicht lief: dort ist die Herkunft der Seite „null",
  die eigenen Bilder gelten damit als fremde Herkunft und WebGL nimmt sie ohne CORS-Kopf nicht an.
  Die Prüfung aus Version 34 lief ins Leere, weil `location.origin` im gesperrten iframe die
  URL meldet und nicht „null"; sie ist jetzt ersatzlos weg.
- Die Polkappe braucht einen Saum, der sich nach ihrer eigenen Größe richtet. Ein fester Anteil
  der Kartenhöhe war bei der 10° schmalen Marskappe breiter als die halbe Kappe und machte aus
  ihr einen Lichtschleier am Pol.
- `art/texturen/` bleibt im Repo, ebenso die Lizenzen in `art/lizenzen/` (Solar System Scope,
  CC BY; I, Voyager, Apache 2.0). Das Spiel rührt beides nicht mehr an.

## 2026-09-20 – three.js für die Körper (Version 34)

Die Himmelskörper zeichnet jetzt three.js, geladen als ES-Modul von `cdn.jsdelivr.net/npm/three`.
Kein Baukasten, keine Abhängigkeit im Repo. Alles andere bleibt, wie es war: Physik, Wirtschaft,
Routenplaner, Autopilot und die ganze Oberfläche sind unverändert.

- **Drei Ebenen übereinander.** `#cvb` (2D, hinten) – `#glc` (three.js) – `#cv` bzw. `#sys` (2D, vorne).
  Verdeckte Bahnstücke gehören auf die hintere Ebene, damit der Körper sie weiterhin abdeckt.
  Beschriftungen, Markierungen, gestrichelte Bahnen, Flammen, Steuerdüsen-Stöße, das Glühen
  und alle Klickziele (HITS) bleiben im 2D-Canvas.
- **Gleiche Projektion wie bisher.** Die three.js-Kamera ist orthografisch und rechnet in
  Bildschirmpixeln, mit denselben Werten wie `makeCam` und `drawSys`: Planetenansicht 22°
  Erhöhung und Blickrichtung je Körper aus `bodyView(b)`, Systemansicht `SYS_EL` = 35°.
  2D und 3D liegen damit deckungsgleich übereinander.
- **Texturen** aus `art/texturen/` (1024×512, equirektangular) für die sieben Planeten und sieben
  Monde. Phobos und Deimos haben keine Textur und bleiben bei ihrer Grundfarbe.
  (Mit Version 35 wieder entfernt, siehe oben.)
- **Tag-Nacht-Grenze** kommt aus dem Licht statt aus einer gezeichneten Halbellipse. Das
  Richtungslicht steht in Kamerakoordinaten auf dem Vektor `LIGHT`, also genau wie vorher.
- **Saturnring** als Ebene in der Äquatorebene mit `Saturn_rings.png`. Das Bild hat außerhalb der
  Ringe schwarze Pixel mit Rest-Deckkraft; deshalb wird beim Laden die Helligkeit als Deckkraft
  gesetzt, sonst läge ein dunkler Schleier über dem Planeten.
- **Rakete** als echtes Dreiecksnetz (dieselben 608 Dreiecke und dieselbe 4×4-Palette wie bisher),
  beleuchtet statt von Hand schattiert. Lage, Länge und Rollen sind unverändert. Sie liegt in
  Kamerakoordinaten vor den Körpern; hinter dem Körper wird sie wie bisher gar nicht gezeichnet.
- **Rückfall auf 2D.** Der alte Weg ist vollständig erhalten und übernimmt, wenn WebGL fehlt, der
  Kontext verloren geht, three.js nicht lädt oder eine Textur nicht ladbar ist. Im gesperrten
  iframe (claude.ai) ist die Herkunft der Seite „null“; dann sind die eigenen Bilder fremde
  Herkunft und WebGL nimmt sie nur mit CORS-Kopf an. Das prüft eine 186-Byte-Stichprobe
  (`palet_4x4.png`) vorab, damit nicht jede Textur einzeln scheitert.
- **Mobil:** Pixelverhältnis auf höchstens 2 begrenzt, Texturen bleiben bei 1024 px.
- Aufwand pro Bild (Erde im Orbit, gemessen im Test-Chromium): 0,9 ms mit three.js gegen 2,0 ms
  auf dem 2D-Weg. Der teure Teil (Kugel, Kontinente, Gitter, Terminator, 608 sortierte Dreiecke)
  liegt jetzt auf der Grafikkarte.
- Die Sonnensystem-Draufsicht (`drawSol`) bleibt wie geplant flach.
- `tests/rakete-bilder.js` läuft jetzt über `http://localhost:8765` statt über `file://` und hängt
  sich an `drawRocket` statt an `rocketMesh`, damit beide Wege geprüft werden.

## 2026-09-19 – Langsame Animation, 3D-Rakete, Standort-Fix (Versionen 29–33)
- Animationen laufen 2,3× langsamer. Ein Tippen auf die Karte macht sie 6× schneller. Beim Autopilot bleibt die Beschleunigung bis zum Ziel. Hinweis „Tippen: schneller“ oben rechts.
- Manöver mit Lagewechsel: Die Rakete dreht sanft (Bremsschub rückwärts, Start senkrecht). Beim Drehen gibt es Steuerdüsen-Stöße an der Spitze, beim Schub eine flackernde Flamme aus der Düse.
- Version 31: Wiederhergestellt, nachdem ein älterer Chat den Prototyp überschrieben hatte.
- Version 32: Fix für den Desktop. Kam der Autopilot am Ziel an (oder hielt er an einem Kontor mit Lieferung), blieb der Routenplaner offen und die Standortkarte (Abliefern, Aufträge, Tanken) war weg. Jetzt geht es in diesen Fällen zurück zur Karte. Beim manuellen Stopp bleibt der Planer offen.
- Version 33: 3D-Rakete aus Hanseatic Galaxy (Ship/SimpleRocket, die Rakete aus dem README-Screenshot).
  - Das Modell ist von 1.826 auf 608 Dreiecke vereinfacht (Clustering pro Farbe) und nutzt die Farben der 4×4-Palette (PICO-8).
  - Die Rakete ist 22 px lang und in allen Ansichten gleich: Flugrichtung in der Bildebene, Nase leicht zum Betrachter gekippt, langsames Rollen um die Längsachse. Sortierung nach Tiefe, Licht von links oben.
  - Aufwand: ca. 1,7 ms pro Frame.
  - Auf dem Landeplatz steht die Rakete jetzt 17 px statt 13 px neben der Markierung.
- Eigenes Repo mit Prototyp, Art, Werkzeugen und Tests angelegt (Version 33).

## 2026-09-19 – 3D-Ansichten und physikalische Manöver (Versionen 22–28)
- Erde mit Kontinenten (grobe Umrisse, ca. 40 Punkte pro Kontinent). Weltraumbahnhöfe an echten Längen- und Breitengraden. Beschriftungen, die über den Rand ragen, wechseln die Seite.
- Vollbild wieder da (Kartenzeile und Menü), mit Hinweis, wenn der Browser es sperrt. iPhone-Safari kann kein Seiten-Vollbild.
- Routenplaner mit Tanken unten: „Volltanken“, „Bis Route reicht“ (+3 %), „Andere Menge wählen“. Danach geht es zurück in den Planer.
- Zufallsfaktor der Belohnung: meist 0,9–1,2, in 8 % der Fälle 1,4–1,9 (hohe Werte seltener). Mittelwert 1,09.
- Planetenansicht in echtem 3D mit fester Kamera 22° über dem Äquator. Liegen die Landeplätze im Süden, schaut die Kamera von unten. Die Blickrichtung ist pro Körper so gewählt, dass möglichst viele Landeplätze vorne liegen (Mond von Süden, damit Shackleton sichtbar ist). Licht von links oben mit Tag-Nacht-Grenze, Gitter, Polkappen und verdeckter Rückseite. Plätze auf der Rückseite sind blass, aber antippbar.
- Manöver in der Planetenansicht:
  - Start: senkrecht, dann nach Osten in eine Bahn mit Neigung gleich der Breite des Startplatzes.
  - Landung: Gleiten zum Bremspunkt (die Bahnebene dreht zur Landebahn), Bremsschub, Abstieg, senkrechtes Aufsetzen, Glühen in Atmosphären.
  - Hüpfer: ballistischer Großkreisbogen.
  - Orbit anheben/absenken: Hohmann-Halbellipse mit Kepler-Tempo.
  - Die Flamme zeigt die Schubrichtung. Im Orbit kreist das Schiff im Leerlauf weiter.
- Systemansicht (Planet mit Monden) in 3D mit Kamera 35°: schattierte Kugeln, Saturnring, Jupiterbänder.
  - Hoher Orbit → Mond: Transferellipse mit Treffpunkt am Ankunftsort des Mondes.
  - Mond → hoher Orbit: Ellipse nach außen.
  - Niedriger ↔ hoher Orbit: Hohmann-Übergang.
  - Aerobremsen: mehrere Durchgänge mit schrumpfender Ellipse.
  - Das Schiff kreist im Leerlauf weiter (niedriger Orbit, um Monde, langsam im hohen Orbit).
- Sonnensystem (Draufsicht bleibt): Transfers als Kegelschnitt durch Start und Ziel (bei 180° genau Hohmann), Schiff mit Kepler-Tempo, Brennflamme bei Abflug und Ankunft.
- Der Maßstab der Bahnhöhen ist bewusst überhöht. Formen und Richtungen stimmen.

## 2026-09-19 – Großaufträge, höherer Isp, Zeit in der Belohnung (Version 21)
- Schiffe: Holk jetzt hybrid (chemisch/elektrisch), Isp 600. Hulk hybrid, Isp 650, Tank 280 t. Karacke Tank 150 t statt 90 t, damit sie das Fernschiff bleibt (Jupiter, Saturn). Kogge unverändert (chemisch, Isp 450). Hinweis: 600–650 s schafft ein rein chemischer Antrieb real nicht (Maximum ca. 460 s), daher „hybrid“.
- Belohnungsformel: neuer Zeitanteil K_ZT = 4 Cr pro Tonne (Fracht + 8 t Schiffsanteil) und Reisetag. Damit lohnt Mars für die Kogge etwa so wie der Mond (ca. 140 Cr pro Tag). Mehrjährige Fahrten zahlen entsprechend.
- Großaufträge: Jeder Erzeuger füllt nebenher ein Großlager (Nachschub 1,5× langsamer als Einzelware). Ist die Losgröße erreicht (7–18 Container), entsteht ein Großauftrag mit 10 % Aufschlag, 180 Tagen Laufzeit und 60 Tagen längerer Frist. Ziel ist ein Kontor mit Bedarf oder ein Drehkreuz. Pro Erzeuger und Ware ist höchstens ein Großauftrag offen. Nach einem Jahr sind etwa 14 offen, nach vier Jahren etwa 26.
- Anzeige: Etikett „Großauftrag“ im Auftragsbrett. Passt er nicht, steht dort „braucht 13 Plätze: Hulk oder größer“, dazu ein Hinweis oben im Brett. Die Werft zeigt pro Schiff: „Erschließt N offene Großaufträge, zusammen X Cr“.
- Hinweis „zu schwer“: Reicht das Δv selbst vollgetankt nicht, sagen Auftragsbrett und Routenplaner jetzt „Zu schwer, auch vollgetankt nur X km/s“ statt „Vorher tanken“.
- Spiel-Bot-Lauf mit den neuen Regeln: Holk nach 10,2 Jahren, Hulk nach 16,1 Jahren, Karacke nach 27,4 Jahren (vorher 95,8). Einnahmen 3,1 Mio. Cr, Treibstoff 1,1 Mio. Cr (36 % statt 65 %). Keine Notbetankung, keine Verspätung.

## 2026-09-19 – Durchgespielt bis zur Karacke (Version 20)
- Behoben: Sackgasse ohne Geld. Mit 0 Cr an einer Tankstelle galt man als „nicht gestrandet“, sobald ein anderes Kontor erreichbar war, auch wenn dort kein Auftrag machbar war. Der Bot wartete dadurch ewig. Jetzt zählt nur, ob Anfahrt plus Auftragsroute mit dem Treibstoff an Bord machbar sind.
- Befund Balance (alte Regeln):
  - Lauf 1 (Holk als Zwischenschritt): Holk nach 21 Jahren, danach Abstieg in die Pleite. Nach 60 Jahren keine Karacke.
  - Lauf 2 (Kogge direkt zur Karacke): Karacke nach 95,8 Jahren. Einnahmen 9,0 Mio. Cr, davon 5,8 Mio. Cr Treibstoff (65 %). Rund 11.000 Cr Gewinn pro Jahr.
  - 188 von 286 Fahrten waren Erde → Shackleton. Interplanetare Fahrten lohnten sich kaum.
  - Holk und Hulk machten auf der Mondfahrt mit üblicher Ladung Verlust (8 t Schiffsanteil in der Belohnung, aber 20 bzw. 45 t Leergewicht; nur 1–3 Container pro Ziel).
  - Offen: Mond → Erde dauert 43 Tage, weil die Route das Aerobremsen (40 Tage, 60 m/s) wählt. Das Auftragsbrett zeigt nur die Bruttobelohnung, nicht netto nach Treibstoff.

## 2026-09-19 – Neustart-Fix und Bot-Test (Version 19)
- Neustart ging nicht: `confirm()` ist in der eingebetteten Artifact-Seite gesperrt. Jetzt Bestätigung im Menü per zweitem Tippen („Wirklich neu starten? Nochmal tippen“).
- Mobil blieb die Karte nach dem Schließen eines Panels leer, weil sie gezeichnet wurde, solange sie ausgeblendet war. Behoben. Dabei lag auch der ⓘ-Knopf über dem Menüknopf.
- Speichern/Laden: Rückfall auf Sitzungsspeicher, wenn der Browser localStorage sperrt.
- Kredit-Betankung wird nur noch angeboten, wenn der Treibstoff an Bord für keinen Auftrag mehr reicht. Vorher war das eine Schuldenfalle.
- Routenplaner: Ist die Route zu teuer, gibt es „Erst zur nächsten Tankstelle“. Bei Strand-Warnung heißt der Knopf „Trotzdem starten“.
- Test-Bot (gesperrter iframe wie auf claude.ai, Desktop und Handy): prüft Neustart, Speichern/Laden, Warten, Legende und die Laderaum-Kachel. Danach spielt er 100–150 Züge (Aufträge, Route-Links, Autopilot, Tanken, Hüpfer, Doppelklick). Ergebnis: keine JS-Fehler, keine NaN- oder Negativwerte, kein horizontales Scrollen. Die Pleiten des Bots kommen von seiner einfachen Strategie (fliegt ohne Reserve zu Orten ohne Tankstelle).

## 2026-09-19 – Notizen umgesetzt (Version 18)
- Layout: Titel entfernt. Desktop: Karte links über die volle Höhe (kein Scrollen mehr), rechts schmale Spalte mit 4 Kacheln (Konto, Δv, Laderaum, Schiff) und darunter Standort bzw. Panels. Mobil: eine Spalte.
- Laderaum nur noch als Kachel, per Klick öffnet sie den Laderaum. Schiff als eigene Kachel, Treibstofftext entfernt.
- „Immer voll“-Schalter in der Δv-Kachel: tankt an jeder Tankstelle automatisch voll, soweit das Geld reicht (auch im Autopilot).
- Legende hinter einem ⓘ-Knopf unten rechts auf der Karte. Meldungen erscheinen als kurze Einblendung unten links.
- Standortkarte kompakt: Beschreibung neben dem Titel, Knöpfe mit Icons in einer Zeile (Aufträge, Tanken, Werft).
- Nachrichtenbox, „Einzelne Manöver und Transfers“ und Zeitknöpfe aus der Seite entfernt. Neues Menü (☰): Speichern, Laden (1 Slot), Zeit vergehen lassen (+10/30/100 Tage, +1 Jahr), Neu starten.
- Doppelklick bzw. doppeltes Antippen auf der Karte: näher ansehen oder Landeplätze zeigen.
- Aufträge (Auftragsbrett und Laderaum) haben einen Link „Route“ zum Routenplaner. Zurück führt zum Ausgangspanel.
- Routenplaner: „Nur nächster Schritt“ lässt das Fenster offen. Der Autopilot lässt es auf dem Desktop auch offen, mobil geht es zurück zur Karte.
- Systemansicht zeigt das Schiff unterwegs zwischen Orbit und Monden. Körperansicht zeigt eine Lande- bzw. Startanimation mit Triebwerksflamme.
- Monde kreiseln im Zeitraffer nicht mehr wild: Während einer Animation laufen sie höchstens eine Runde und enden auf der echten Position.
- Ballistische Hüpfer zwischen Landeplätzen desselben Körpers (Landeplätze haben jetzt Längengrade). Energieärmste ballistische Bahn über den Großkreis. Ohne Atmosphäre: 2·v. Mit Atmosphäre: anteilige Aufstiegsverluste, Luft bremst mit. Erde: suborbitaler Flug per Trägerrakete für 40 % der Startgebühr. Die Ersparnis hängt von der Entfernung ab: kurze Hüpfer sind viel billiger, Hüpfer über 90° sparen nur 10–20 %.
