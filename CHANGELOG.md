# Transferfenster – Änderungsprotokoll

Spielbare Version im Repo: `index.html`. Tests liegen in `tests/`, die Art in `art/`.

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
