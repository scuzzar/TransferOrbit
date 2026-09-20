// Der Aufbau des Spiels: Module verbinden, Signale verteilen, Spielstand laden.
// Nur hier weiß jemand, dass es sowohl eine Steuerung als auch eine Anzeige gibt.

import * as Ereignisse from './ereignisse.js';
import * as Basis from './basis.js';
import * as Welt from './spiel/welt.js';
import * as Physik from './spiel/physik.js';
import * as Zustand from './spiel/zustand.js';
import * as Graph from './spiel/graph.js';
import * as Wirtschaft from './spiel/wirtschaft.js';
import * as Aktionen from './spiel/aktionen.js';
import * as Geometrie from './karte/geometrie.js';
import * as Planer from './spiel/planer.js';
import * as Steuerung from './spiel/steuerung.js';
import * as Leinwand from './karte/leinwand.js';
import * as Raketendaten from './karte/raketendaten.js';
import * as Gl from './karte/gl.js';
import * as Rakete from './karte/rakete.js';
import * as Ansicht from './karte/ansicht.js';
import * as Zeichnen from './karte/zeichnen.js';
import * as Bausteine from './ui/bausteine.js';
import * as Pickkarte from './ui/pickkarte.js';
import * as Panels from './ui/panels.js';
import * as Anzeige from './ui/anzeige.js';
import * as Menue from './ui/menue.js';

// Die Anzeige hört zu, die Steuerung ruft. Andersherum kennt niemand die Anzeige.
Ereignisse.beiAenderung(()=>{ Anzeige.render(); Steuerung.save(); });
Ereignisse.beiZeit(()=>{ Anzeige.header(); Anzeige.speedHint(); Zeichnen.draw(); });

// Jedes Modul hängt seine eigenen Ereignisse an.
Ansicht.verdrahteKarte();
Zeichnen.verdrahteZeichnen();
Anzeige.verdrahteAnzeige();
Menue.verdrahteMenue();

if(!Steuerung.load()) Steuerung.newGame();
Ereignisse.geaendert();
requestAnimationFrame(Zeichnen.idleLoop);

// three.js kommt erst nach dem ersten Bild und nur, wenn das Netz mitspielt.
// Ein dynamisches import() hält den Rest des Spiels am Leben, wenn das CDN gesperrt ist.
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js')
  .then(THREE => Gl.glInit(THREE))
  .catch(e => Gl.glOff(e && e.message || String(e)));
setTimeout(()=>{ if(Gl.GL.state==='laden') Gl.glOff('three.js liess sich nicht laden.'); }, 10000);

// Eine einzige Außenkante für Tests und die Konsole: TO.<Name> zeigt immer den
// aktuellen Wert, TO.modul.<Modul> das ganze Modul.
const MODULE = {
  'ereignisse':Ereignisse, 'basis':Basis, 'spiel/welt':Welt, 'spiel/physik':Physik, 'spiel/zustand':Zustand, 'spiel/graph':Graph, 'spiel/wirtschaft':Wirtschaft, 'spiel/aktionen':Aktionen, 'karte/geometrie':Geometrie, 'spiel/planer':Planer, 'spiel/steuerung':Steuerung, 'karte/leinwand':Leinwand, 'karte/raketendaten':Raketendaten, 'karte/gl':Gl, 'karte/rakete':Rakete, 'karte/ansicht':Ansicht, 'karte/zeichnen':Zeichnen, 'ui/bausteine':Bausteine, 'ui/pickkarte':Pickkarte, 'ui/panels':Panels, 'ui/anzeige':Anzeige, 'ui/menue':Menue,
};
const TO = { modul: MODULE };
for(const raum of Object.values(MODULE))
  for(const name of Object.keys(raum))
    if(!(name in TO)) Object.defineProperty(TO, name, { get:()=>raum[name], enumerable:true });
window.TO = TO;
