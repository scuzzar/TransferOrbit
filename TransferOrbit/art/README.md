# Art aus Hanseatic Galaxy

Quelle: https://github.com/scuzzar/HanseaticGalaxy (Godot 3). Übernommen am 2026-09-19.

## Modelle (art/meshes/*.json)
Format: `v` = xyz als int16, mal `scale` gerechnet ergibt Meter (Godot-Achsen, Y oben). `f` = Dreiecke als a,b,c,Farbindex. `palette` = die 16 Farben der 4×4-Palette (ColorScheme/palet_4x4.png, PICO-8-Farben). Die Farbe kommt aus der UV-Koordinate der Palette. Alle Teile einer Szene sind mit ihren Knoten-Transformationen zusammengeführt.

| Datei | Inhalt | Dreiecke |
|---|---|---|
| SimpleRocket.json | Rakete aus dem README-Screenshot (blauer Rumpf, orange Flossen) inkl. 3 Container-Slots | 2.390 |
| SimpleRocket_lowpoly.json | nur der Rumpf, vereinfacht; im Prototyp eingebaut (v33); int8-Werte, `s` = Skalierung | 608 |
| Tender.json | Tender (kleinstes Schiff) | 936 |
| SkyCrane.json | SkyCrane (Rakete mit 9 Container-Slots) | 3.370 |
| KillSat.json | Killer-Satellit mit Solarflügeln | 1.748 |
| Station.json | Ringstation mit 18 Slots | 3.978 |
| SpacePort.json | Raumhafen (groß) | 21.317 |
| Container.json | Frachtcontainer, je Ware eine Farbvariante: Metals, Food, Mechenes, Electronics, ConsomerGoods, RareMetal, LuxusGoods | je 188 |

Schiffsdaten im Original (Ship/shipTypes.csv): Tender, Tender S, Rocket S, Rocket IP, SkyCrane, SkyCrane S, KillSat.

## Texturen und Bilder
- `texturen/`: Planeten- und Mondtexturen, verkleinert auf 1024×512 (equirektangular). Saturnring 512×512. Dazu die Palette `palet_4x4.png`.
- `bilder/`: Banner und Screenshot von Hanseatic Galaxy, Artemis-Icon, Übersicht aller Modelle (`modelle_uebersicht.png`).
- Die Originale in voller Auflösung liegen im Hanseatic-Galaxy-Repo unter Bodys/tex/ und Screenshots/.

## Werkzeuge
`../tools/escn2json.py` liest Godot-.escn-Szenen und wandelt sie in dieses JSON um. `../tools/decim.py` vereinfacht Modelle (Clustering pro Farbe). `../tools/preview.py` rendert Vorschaubilder.

## Lizenzen
Siehe `lizenzen/` (Kopie von 3DPartyLICENSEs aus Hanseatic Galaxy). Texturen: I, Voyager (Apache 2.0, Charlie Whitfield) und Solar System Scope (CC BY). Die Modelle stammen aus dem Hanseatic-Galaxy-Projekt selbst.
