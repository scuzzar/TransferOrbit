# Art from Hanseatic Galaxy

Source: https://github.com/scuzzar/HanseaticGalaxy (Godot 3). Taken over on 2026-09-19.

## Models (art/meshes/*.json)
Format: `v` = xyz as int16, multiplied by `scale` gives metres (Godot axes, Y up). `f` = triangles as a,b,c,colour index. `palette` = the 16 colours of the 4×4 palette (ColorScheme/palet_4x4.png, PICO-8 colours). The colour comes from the UV coordinate into the palette. All parts of a scene are merged with their node transforms applied.

| File | Contents | Triangles |
|---|---|---|
| SimpleRocket.json | the rocket from the README screenshot (blue hull, orange fins) including 3 container slots | 2,390 |
| SimpleRocket_lowpoly.json | the hull only, simplified; built into the prototype (v33); int8 values, `s` = scale | 608 |
| Tender.json | Tender (the smallest ship) | 936 |
| SkyCrane.json | SkyCrane (a rocket with 9 container slots) | 3,370 |
| KillSat.json | killer satellite with solar wings | 1,748 |
| Station.json | ring station with 18 slots | 3,978 |
| SpacePort.json | spaceport (large) | 21,317 |
| Container.json | cargo container, one colour variant per goods type: Metals, Food, Mechenes, Electronics, ConsomerGoods, RareMetal, LuxusGoods | 188 each |

Ship data in the original (Ship/shipTypes.csv): Tender, Tender S, Rocket S, Rocket IP, SkyCrane, SkyCrane S, KillSat.

## Textures and images
- `textures/`: planet and moon textures, scaled down to 1024×512 (equirectangular). Saturn's ring 512×512. Plus the palette `palet_4x4.png`.
- `images/`: banner and screenshot from Hanseatic Galaxy, the Artemis icon, an overview of all models (`modelle_uebersicht.png`).
- The originals at full resolution live in the Hanseatic Galaxy repository under Bodys/tex/ and Screenshots/.

## Tools
`../tools/escn2json.py` reads Godot .escn scenes and converts them into this JSON. `../tools/decim.py` simplifies models (clustering per colour). `../tools/preview.py` renders preview images.

## Licences
See `licences/` (a copy of 3DPartyLICENSEs from Hanseatic Galaxy). Textures: I, Voyager (Apache 2.0, Charlie Whitfield) and Solar System Scope (CC BY). The models come from the Hanseatic Galaxy project itself.
